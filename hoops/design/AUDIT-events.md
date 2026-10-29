# hoops/career.js: complete card catalog and engine audit

Source: `/home/user/runthe-gg-site/hoops/career.js` (4,034 lines, `CAREER_API_VERSION = 1`, `LIFE_VERSION = 1`).
Every claim below comes from reading the source. The "measured" frequencies come from a simulation of 300 careers per start type (`start:'hs'` = H, draft night = D), with options picked uniformly at random. A random policy changes career length, so read those numbers as orders of magnitude, not targets.

Notation. `Δ` means a change made through `bump()`. Ratings are `sho fin pla def reb ath iq` (clamped 25-99). Meters are `health morale fame trust` (0-100). `eth`/`dur` are 0-100, `pot` is 40-99 and `cash` is in $M. Season mods `min usage perf win risk rest` are added to `L.season.mods` and silently dropped if `L.season` is null. "ok(p)" means `rng() < clamp(p, .03, .97)`. "rep" means the reputation move from `EVENT_REP` as [fans, respect] for options 1, 2, 3. It applies only to `EVENTS` cards, never to `AM_EVENTS`.

---

## 0. Where cards come from

| Source | How dealt | Count |
|---|---|---|
| `EVENTS` (NBA pool) | `queueEvents(L, phase, n)`: filter by `phases`, the per-season `used` map, `once` and `when(L)`, then pick by `weight(L)` with `rngAt('ev:'+phase+':'+pending.length)` | 47 events, 122 options |
| `AM_EVENTS` (road pool) | same function with `pool = AM_EVENTS` | 20 events, 53 options |
| `PRESSERS` via `presserCard(topic)` | pushed directly after a moment | 5 topics × 4 answers = 20 options |
| Generated cards (built in code) | pushed directly by the step machine or by `choose` | 21 ids: combine, workout, agent, undrafted, training, injury, allstar, clutch, amclutch, extension (ext/vext), fa, nooffer (nooffer/nooffer2), retire, after, presser, hs_summer, offers, signing, commit, declare, portal |
| `ACTS` (not cards) | `act(L,id)`, once a year each, not while a card is pending or on the road | 7 actions |

How many cards each `queueEvents` call deals:

| Phase arg | Called from | n |
|---|---|---|
| `pre` | `openYear` (only if `seasonsDone > 0`) | 1 at 60% (`n:pre`), else 0 |
| `early` | step `drafted`/`pre`, after games 1-27 | 1, +1 at 60% |
| `mid` | step `early`, after games 28-55 | 1, +1 at 50% |
| `late` | step `mid`, after games 56-82 **and after standings, seeding and awards** | 1 |
| `off` | end of `offseason()` | 1 |
| `hs_sum` | `newLife` (road, 50%); `amNewYear` grades 11/12 (55%) | 0-1 |
| `hs` | `hsRegular`, **after all 26 games** | 1, +1 at 50% |
| `col_pre` | `colYear` | 1 at 65% |
| `col` | `colStart` (1, +1 at 50%) after 12 non-conference games; `colConf` (1) after 19 conference games | 1-3 a year |
| `hs_off` / `col_off` | `closeAm` | 1 at 55% |

`used` is `L.season.used` whenever a season object exists, which in practice is always, including in the `off` phase, because `closeSeason` does not null `L.season`. An event dealt in `mid` therefore cannot be dealt again in the same year's `off`. `once` events go into `L.flags.once` for the whole life.

---

## 1. The catalog

### 1a. Generated cards: NBA half and the draft

| id | stage/step where dealt | prerequisites / condition | choices | main consequences | follow-ups it queues | weight / rarity |
|---|---|---|---|---|---|---|
| `combine` | `newLife` (draft-night start) or `toDraft` (end of the road); phase `combine` | always | Do everything / Shoot only / Skip it | Option 1: ok(.3+((ath+sho)/2-55)·.012, clamped .15-.85) → `flags.stock` +3, else -2.5. Option 2: ok(.35+(sho-55)·.015, clamped .1-.9) → +1.8, else -1. Option 3: nothing | unshifts `workout` | 1 per career (100%) |
| `workout` | phase `combine` | always; built from `draftOrder` + `projectedPick` | "The {club}" for the clubs at slots proj-9, proj-1 and proj+7, de-duplicated by club, so **1-3 options** while the title always says "Three teams" | slot < proj-4: 45% → stock +2 and `flags.promise={club,slot}`, else nothing. Any other slot: promise automatically | unshifts `agent` | 100% |
| `agent` | phase `combine` | always | 3 options, labelled with generated names: power / boutique / cousin | `L.agent` = key (salary ×1.08/1/.92, fee .04/.03/0, endorsements ×1.25/1/.8). Cousin: morale +8. Sets phase `draft` | none (the next step runs `runDraft`) | 100% |
| `presser` topic `draft` | `runDraft`, round-1 picks only; unshifted ahead of the summer cards | `round === 1` (pick ≤ 30) | humble / showman / cocky / cold (answers in `PRESSERS.draft`) | see the `presser` row in 1d | none | about 52% of careers (311 of 600) |
| `undrafted` | `runDraft` when the pick is past 60 and no promise applies | p > 60 | 3 clubs drawn from the bottom, middle and top of the net-rating table | 1-year minimum `contract`, `joinTeam`, `L.draft={pick:null,...}`, phase `drafted`, `openYear` | `openYear` → `training` (+ an injury roll) | rare: H 2%, D 0% measured |
| `training` | `openYear` every season with a team (phase `drafted`/`pre`); also `colYear` (`col_pre`) | always | Shooting gym / Strength and speed / Point guard school / Defensive camp / Rest and recover | `TRAIN[i]` × age factor (1 / .8 / .6) × rng .7-1.3: {sho2,iq1} / {ath1,fin1,reb1} / {pla2,iq1} / {def2,ath1}. Rest: health +18 and `flags.restYears++`, which is write-only, so the "slower decline" hint is false | none | about 15 per career (every NBA and college year) |
| `injury` | `rollInjury(chunk)`: chunk `early` (inside `openYear`, before the season), `mid` (end of the `drafted`/`pre` step), `late` (end of the `early` step) | p = .065 + (100-dur)·.0011 + max(0,age-28)·.009 + max(0,60-health)·.0016 + mods.risk; a non-major (62%) injury is a beat with no card; otherwise a card; skipped if a current injury already reaches the chunk | **Major** (r > .9, 30-55 games): Surgery now / Rehab and rush back / Fly to a specialist. **Moderate** (10-21 games): Play through it / Take the full time | Major 1: out g, ath -2, health -8. Major 2: 55% out .6g with health -6, else out 1.3g with ath -4, health -14, dur -6. Major 3: cash -min(.6, 20%), out .85g, ath -1. Moderate 1: 60% out ceil(g/2) with trust +4, else out g+6 with health -8. Moderate 2: out g, health +6 | none | H 1.7 per career (80%), D 1.8 (84%); about 25% of cards are major |
| `allstar` | end of the `early` step (`allStarCheck`), phase `mid` | gp ≥ 25 and effOvr + fame·.07 + (ppg-18)·.35 + (w-l)·.05 + N(0,1.5) ≥ 88.5. On selection: fame +6, morale +5, `flags.allstars++` | Dunk contest / Three-point contest / Rest your legs | Dunk: p=clamp((ath-60)·.025, .05, .85) → `flags.dunk++`, fame +10, else fame +2. Three: p=clamp((sho-65)·.025, ...) → `flags.threes++`, fame +8, else +2. Rest: health +6 | none; `'star'` is added to the season's awards at the `mid` step | about 30% of careers; 2.2-2.6 per career among those |
| `presser` topic `mvp` | `mid` step after awards (the card appears in phase `late`) | MVP awarded: gp ≥ 65, effOvr ≥ 91, seed ≤ 3, then rng < .62·logistic(...) | team / confident / cocky / showman | see 1d | none | very rare: 11 in 600 careers |
| `clutch` | `continueSeries`, phase `po`, **every** series that reaches 3-3 | the series is tied 3-3. The player's injury and role are **not** checked | Pull-up three / Drive to the rim / Mid-range fadeaway / Find the open man (hint shows the rating) | p by option: .2+(sho-50)·.0065 [.12-.55]; .26+((fin+ath)/2-50)·.0058 [.15-.58]; .25+((sho+iq)/2-50)·.0052 [.15-.55]; .27+(pla-50)·.0045+net·.006 [.15-.55]. Make: series won, `flags.g7++`, fame +10, morale +10. Miss: series lost, morale -10 | `endSeries` → may push `presser` title or finals_loss | about 4.4 per career, 95-98% of careers |
| `presser` topic `title` / `finals_loss` | `endSeries`, round 3 (Finals) | won the Finals / lost the Finals | title: team / loyal / cocky / cold. finals_loss: humble / fiery / team / cold | see 1d. A title also pushes `champ` (and `fmvp` if role.diff ≥ 6, or a starter at 25%), `flags.rings++`, fame +14, morale +20 | none | a title presser in 533 of 600 random-policy careers (counted per presser); finals_loss 434 |
| `extension` key `ext` (rookie) | `offseason()`, phase `off` | after the year is decremented, `contract.years === 1`, `kind === 'rookie'`, ovr ≥ 66 | Sign it / Bet on yourself | Sign: contract {years 6, total 5, salary unchanged, next = ctx.sal, kind 'vet'}, morale +6, trust +6. Bet: fame +2, then restricted free agency next summer (cosmetic: no matching rights) | none | 311 in 600 careers |
| `extension` key `vext` (veteran) | `offseason()` | `years === 1`, kind ≠ rookie, ovr ≥ 72, age ≤ 31, `!flags.extAsked` (set true here, reset when the contract expires) | Sign it / Test the market | Sign: 4 years at ctx.sal (years 5, total 4, next = sal) | none | 647 in 600 careers |
| `fa` key `fa:` / `fa:rfa` / `fa:back` | `offseason()` when the contract has expired; `overseasYear` when there are offers and age < 34 | `offers(L)` returned 1-5 offers (count from marketOvr: ≥85 → 5, ≥76 → 4, ≥70 → 3, ≥66 → 2, else 1 at chance (o-57)/9); own club first if o ≥ rotationBar-8 | one option per offer (label "The {club}" with " (re-sign)" for the own club; hint shows years, salary, role and tier) | contract {years, salary, kind 'vet', start year+1}; `joinTeam` if a new club; morale +5 | none | about 2.1-2.4 per career, 92-99% |
| `nooffer` key `nooffer` | `offseason()` | contract expired and no offers | Retire / Play overseas | Retire → `retire()` (clears the pending queue). Overseas: `flags.overseas++` (write-only), team null, contract {kind 'overseas', 0.8, 1 yr} | Retire → `after` | H 26%, D 12% |
| `nooffer` key `nooffer2` | `overseasYear` | no offers, **or age ≥ 34 even when offers exist** | Retire / Another year overseas | same handler as `nooffer` | Retire → `after` | included above |
| `retire` | `offseason()` | "tired" (age ≥ 34, or age ≥ 31 and ovr < 70); pushed whether or not the contract expired, ahead of the fa/nooffer card | One more season / Retire | Retire: `L.pending=[]` then `retire()`. One more: morale +3 | Retire → `after` | 1.6-1.7 per career, 94-100% |
| `after` | `retire()` (phase `after`) | any retirement except `retireNow()` with no history | Coach / Television / Run a front office / Business / Go home | `retired = true`, phase `retired`, `final = legacy(L)`, `final.after = chooseAfter(...)` (see section 4) | none: terminal | 1 per career |

### 1b. Generated cards: the road (high school and college)

| id | stage/step | prerequisites | choices | main consequences | follow-ups | rarity |
|---|---|---|---|---|---|---|
| `hs_summer` | `newRoad` (sophomore, phase `hs_pre`) and `amNewYear` for grades 11 and 12 | always on the road | The shoe circuit / Skills trainer every day / Run with your high school team / Rest and grow | 1: fame +5, health -6, ath +1, `am.rstock` +.8. 2: +2-3 to the first two positive keys of the archetype tilt, eth +3. 3: trust +8, iq +1, win +.6. 4: health +12, dur +2 | none | 3 per road career |
| `offers` | `hsOffCards`, after the grade-11 season (phase `hs_off`) | grade 11 and no college | up to 3 "Commit to {school}" (`collegeOffers`, weighted by `am.rank`) + "Keep your options open" | Commit: `am.college`, morale +6 (does **not** set `am.route`). Wait: fame +2 | none (decided in senior year) | 1 per road career |
| `signing` | `hsOffCards`, grade 12 | `am.college` already set | Sign with {college} / Reopen your recruitment | Sign: log only. Reopen: college = null, fame +3 | Reopen → unshifts `commit` | 77% of road careers |
| `commit` | `hsOffCards` grade 12 with no college, or after `signing` reopen | as above | up to 3 schools + "Turn pro overseas" (rank ≤ 90) + "Sign with the G League" (rank ≤ 140) | School: college, route 'college', morale +6. Pro: `am.route` intl/gl, college null | none (the route takes effect at `amNewYear`) | 60% |
| `amclutch` | `runTourney` (HS state tournament or NCAA) | playing (not injured), `role.starter`, the first game of this tournament where `|u - p| < .07`; once per tournament (`t.clutched`) | the same 4 shots as `clutch` (`clutchOptions`) | Make: `am.winners++` (write-only), fame +6, morale +8, game won. Miss: morale -8, game lost. The tournament then continues to `upto` | may lead to `presser` ncaa (via `endTourneyGame`) and `closeAm` | H 1.33 per career (73%) |
| `presser` topic `ncaa` | `endTourneyGame` when the NCAA title is won (phase `col_po`; card appears around `col_off`) | national champion | team / loyal / confident / cocky | see 1d | none | rare: 14 in 300 road careers |
| `declare` | `colOffCards` after freshman, sophomore and junior years (phase `col_off`) | `cyear < 4`; at `cyear ≥ 4` the player is auto-declared with no card | Declare for the draft / Come back for your {next} year / Enter the transfer portal | Declare: `am.declared`. Return: trust +6, morale +2. Portal → unshift `portal` | `portal` | 1.9 per road career (88%) |
| `portal` | after `declare` option 3 | - | up to 3 schools (offers drawn using a temporary rank = proj·5) + "Stay at {college}" | School: college = school, trust reset to 50 (no sit-out year). Stay: nothing | none | 42% |

### 1c. AM_EVENTS (road pool, `queueEvents(..., AM_EVENTS)`)

Unlike `EVENTS`, these have no `EVENT_REP`, so they never move reputation.

| id | phases | prerequisites | choices | main consequences | follow-ups / flags | weight · rarity (H) |
|---|---|---|---|---|---|---|
| `grades` | hs, col | always | Study every night / Get a tutor / Wing it | 1: iq +1, morale -2, eth +3. 2: trust +3, morale +1. 3: 50% morale +2, else rest +.12 and trust -6 ("sit three games") | - | 3 · 2.0/career, 90% |
| `mixtape` | hs, hs_sum | `am.level==='hs'` | Post more / Stay quiet / Call out {prepstar} | 1: fame +8, trust -3, rstock +.5. 2: trust +4, iq +1. 3: fame +10, then ok(.4+(ovr-45)·.03) → rstock +1, else rstock -.8 and morale -6 | - | 3 · 1.5, 87% |
| `coach_son` | hs | grade ≤ 11, `role.diff < 9` | Outwork him / Talk to {coach} / Let your dad handle it | 1: eth +5, then 55% min +6, trust +6. 2: 40% min +5, else trust -8. 3: trust -10, morale +2 | - | 3 · 10% |
| `rival_school` | hs | always | Guarantee a win / Let your game talk / Lock up their star | 1: fame +5, then ok(.35+(ovr-40)·.02) → morale +8, win +.5, rstock +.5, else morale -7. 2: 55% morale +5, win +.3, else morale -3. 3: def +1, trust +4, win +.3 | - | 2.5 · 68% |
| `double_team` | hs, col | `role.label === 'Go-to player'` (diff ≥ 10 and starter; this label exists only in `amRole`) | Find the open man / Score through it / Ask {coach} for new sets | 1: pla +2, win +.4, usage -.01. 2: 50% fin +1, fame +4, else morale -4, health -3. 3: iq +2, trust +3 | - | 3 · 75% |
| `homecoming` | hs | always | Go / Stay home and rest | 1: morale +8, then 40% health -4 and perf -.3. 2: morale -3, health +3 | - | 1.5 · 47% |
| `prep_transfer` | hs_sum | once; grade ≤ 11, rank ≤ 220 | Transfer / Stay home | Transfer: `am.hs` = "{town} Prep Academy" (net 4.5), fame +6, morale -6, trust -10, rstock +.6. Stay: morale +6, trust +6 | - | 4 · 18% |
| `growth` | hs_sum | once; age ≤ 16 | Learn to play bigger / Keep your guard skills | {reb3, fin2, def1, pot1} / {pla2, sho1, ath1, pot1} | - | 2.5 · 34% |
| `camp_invite` | hs_sum | rank ≤ 120 | Compete with everyone / Go to learn / Skip it and rest | 1: health -4, then ok(.35+(ovr-42)·.025) → rstock +1.2, fame +5, else rstock -.4. 2: iq +2, def +1. 3: health +6 | - | 3 · 20% |
| `street_agent` | hs_off, hs_sum | once; rank ≤ 100 | Tell him no / Take the envelope / Tell {coach} | 1: morale +2, trust +2. 2: cash +.02, morale +3, **`am.envelope = true`**. 3: trust +6 | the envelope enables `investigation` | 2.5 · 39% |
| `class_skip` | col | always | Go to office hours / Get notes from {mate} / Ignore it | 1: iq +1, trust +2. 2: morale +1. 3: 55% nothing, else rest +.1, trust -6 | - | 2 · 65% |
| `freshman_wall` | col | `cyear === 1` | Extra lifting / Sleep and eat / Push through it | 1: ath +1, reb +1, health -4. 2: health +8, perf +.3. 3: 50% eth +4, else health -6, perf -.4 | - | 3 · 46% |
| `nba_scouts` | col | `am.stock > -2` | Show them everything / Play your role | 1: 50% stock +.8, else stock -.4, trust -3. 2: trust +4, stock +.3 | - | 2.5 · 67% |
| `rivalry_col` | col | always | Take over the game / Run the offense / Talk trash before it | 1: ok(.3+(ovr-50)·.025) → fame +8, win +.3, stock +.6, else morale -5. 2: win +.4, trust +3. 3: fame +5, then 50% nothing, else morale -4, trust -3 | - | 2 · 56% |
| `booster` | col, col_pre | once; `am.level==='col'` | Take the keys / Ask for a legal NIL deal instead / Turn it down | 1: 60% morale +6, else rest +.25, fame +3, trust -8, stock -.6. 2: cash +.08, morale +2. 3: trust +3 | - | 1.8 · 59% |
| `nil_deal` | col_pre | col and fame ≥ 15 | Sign it / Local businesses only / Focus on basketball | 1: cash and `earned` + (.05 + fame^1.4·.002), fame +3, trust -2. 2: cash and earned + (.02 + fame·.0008), morale +3. 3: trust +4, iq +1 | - | 4 · 53% |
| `roommate` | col_pre | once; `cyear === 1` | Start waking up at five too / Show him the city / Ask for a single | {eth6, health-2} / {morale6, trust2} / {morale1, trust-2} | - | 4 · 25% |
| `coach_leaves` | col_off | once; `cyear ≤ 3` and a college | Wish him well / Ask him to put in a word with the {leaveclub} | **`queue` runs when the card is dealt**: fires the coach of the worst NBA club and hires the college coach there (since = year+1), sets `flags.leave={club,n}` and `am.cv++` (a new college coach). 1: trust = 50, morale -3. 2: trust = 50, stock +.6 | - | 2 · 41% |
| `investigation` | col | once; `am.envelope` | Tell the truth / Deny everything | 1: envelope cleared, rest +.2, trust +4. 2: envelope cleared, then 60% nothing, else rest +.35, fame +4, trust -10, stock -1 | - | **8** (dominant when eligible) · 7% |
| `summer_league` | col_off, hs_off | always | Play / Rest | 1: health -3, then 50% fame +6, iq +1, else iq +1. 2: health +5 | - | 1.5 · 2.1/career, 93% |

### 1d. Press conferences (`PRESSERS`, `presserCard`, `choosePresser`)

Every answer carries a tone. `choosePresser` applies `TONES[tone].d` through bump, moves rep (fans, resp) and increments `flags.press` (write-only). Only `cocky` has risk: at 45% it also does trust -3, morale -2 and rep -2/-3, and returns a `TONE_BAD` line. Otherwise it returns one of two `TONE_SAY` lines for the tone.

| tone | Δ meters | rep [fans, resp] |
|---|---|---|
| humble | trust +3, fame +1 | +2, +5 |
| team | trust +4, morale +2 | +2, +5 |
| confident | fame +3, morale +2 | +4, +1 |
| loyal | trust +2, morale +2, fame +1 | +5, +2 |
| showman | fame +4, morale +2 | +6, -3 |
| fiery | morale +4, fame +2 | +4, 0 |
| cold | trust +2, fame -1 | -5, +4 |
| cocky | fame +5, trust -3 | -6, -6, risk .45 |

| topic | dealt by | answers (tone) | measured count (600 careers) |
|---|---|---|---|
| `draft` | `runDraft`, round 1 | humble, showman, cocky, cold | 311 |
| `mvp` | `mid` step after the MVP award | team, confident, cocky, showman | 11 |
| `title` | `endSeries` after winning the Finals | team, loyal, cocky, cold | 533 |
| `finals_loss` | `endSeries` after losing the Finals | humble, fiery, team, cold | 434 |
| `ncaa` | `endTourneyGame` after winning the national title | team, loyal, confident, cocky | 14 |

### 1e. EVENTS (NBA pool)

Rows are in source order. "rep" lists the `EVENT_REP` entries.

| id | phases | prerequisites (`when`) | choices | main consequences | follow-ups / flags | weight · rarity (H / D) |
|---|---|---|---|---|---|---|
| `vet_mentor` | early | once; rookie season (`seasonsDone===0`) | Shadow him every day / Ask about money / Do your own thing | 1: iq +2, eth +6, trust +4. 2: cash +.2, iq +1, **`flags.savvy`**. 3: morale +2 | `savvy` improves the `investment` odds | 4 · 28% / 28% |
| `rookie_duty` | early | once; rookie season | Go along with it / Turn it into content / Refuse | 1: trust +6, cash -.05, morale -2. 2: 60% fame +6, trust +2, else fame +3, trust -6. 3: trust -8, morale +3 | - | 3 · 18% / 23% |
| `night_out` | early, mid, late | always | Go out / One drink, then home / Stay in | 1: 55% morale +8, health -4, else morale +4, health -6, trust -7, fame +3. 2: morale +4, health -1. 3: iq +1, health +2, morale -2 | - | 3 · **5.9 / 6.3 per career** (the most dealt event) |
| `hot_streak` | early, mid, late | `role.min ≥ 22` | Tell them you are the best player here / Credit your teammates / Say nothing | 1: fame +8, trust -4, then 50% usage +.02, else morale -3. 2: trust +5, morale +4, win +.4. 3: fame +2. rep [-2,-3],[2,4],[-2,2] | - | 3 · 4.1 / 4.9 |
| `slump` | early, mid, late | `role.min ≥ 14` | Midnight shooting / Get to the rim instead / Keep shooting | 1: health -4, then 70% sho +2, morale +4, else morale -4. 2: fin +1, usage -.01, perf +.4. 3: 50% morale +6, fame +2, else morale -6, trust -3 | - | 3 · 5.3 / 5.9 |
| `coach_bench` | early, mid | starter and `role.diff < 6` | Accept it / Push back / Ask for a trade | 1: trust +10, min -4, usage +.03. 2: 40% trust -3, else trust -12, min -5, morale -6. 3: **`flags.tradeAsk = true`**, trust -15, fame +3 | tradeAsk → traded in `offseason()` | 2 · 44% / 61% |
| `stuck` | early, mid | `role.min < 18` | Outwork him / Vent on a podcast / Ask to go to the G League | 1: eth +5, health -3, then 55% trust +10, min +5, else trust +4. 2: fame +6, trust -12, morale +3. 3: fin, sho, iq +1 each, min -3, trust +4. rep [0,3],[2,-3],[0,1] | - | 4 · 42% / 27% |
| `film_session` | early, mid, late | always | Own it / Argue / Laugh it off | 1: def +1, trust +6. 2: 30% trust +2, else trust -9. 3: morale +2, trust -3. rep [0,3],[0,-3],[1,0] | - | 2 · 4.2 / 4.5 |
| `teammate_touches` | mid, late | starter | Feed him / Talk it out in private / Ignore it | 1: pla +1, usage -.02, win +.5, trust +3. 2: 65% morale +3, win +.3, else morale -3. 3: win -.6, morale -2 | - | 2 · 2.0 / 2.4 |
| `trade_rumor` | mid | `!tradeAsk` and `contract.years ≥ 1` | Tell them you want to stay / Ask to go to a contender / Say nothing | 1: trust +6, then 80% stay, else `tradeNow`. 2: 55% `tradeNow(contender)`, else trust -8. 3: 25% `tradeNow` | `tradeNow` rewrites the season record to the new club's estimate | 4 if club net < -2, else 1.5 · 1.7 / 1.8 |
| `tank` | late | `l - w ≥ 10` | Go along / Refuse / Ask for a trade | 1: min -6, health +6, trust +4. 2: trust -8, fame +3, win +.4. 3: tradeAsk, trust -10 | tradeAsk | 4 · 42% / 46% |
| `injury_tweak` | mid, late | always | Play through it / Sit a week / Get a second opinion | 1: 60% trust +4, health -4, else health -10, risk +.05, perf -.5. 2: health +8, rest +.05. 3: cash -.1, health +5 | - | 4 if health < 55, else 1.5 · 2.4 / 2.4 |
| `shoe_deal` | pre, mid, off | once; fame ≥ 55 | The biggest brand / Your own signature shoe / Stay a free agent | 1: `L.endorseBonus` +4, fame +4. 2: endorseBonus +2, fame +9, then 50% +3 more. 3: morale +2 | endorseBonus is added to endorsements every paid season | 4 · 55% / 67% |
| `local_ad` | pre, early, off | fame ≥ 25 | Do it / Pass | 1: cash +.25, fame +2, then 35% fame +4. 2: morale +1. rep [2,-1],[-1,0] | - | 2 · 3.8 / 4.3 |
| `online_beef` | early, mid, late | fame ≥ 30 | Clap back / Answer Friday / Ignore it | 1: fame +6, then 50% morale +6, else morale -5. 2: ok(.35+(ovr-70)·.012) → fame +8, morale +8, perf +.3, else morale -6. 3: trust +2. rep [3,-4],[1,1],[-2,2] | - | 2 · 3.4 / 3.6 |
| `ref_heat` | early, mid, late | always | Let him have it / Walk away | 1: fame +3, cash -.04, then 50% trust -5. 2: iq +1. rep [2,-3],[0,2] | - | 1.5 · 3.4 / 3.6 |
| `heckler` | mid, late | fame ≥ 20 | Confront him / Tell security / Wink and hit a three | 1: 40% fame +5, trust -3, else fame +6, cash -.2, trust -6, rest +.03. 2: trust +3. 3: p = sho/120 → fame +6, morale +5, else morale -2. rep [-1,-4],[-1,2],[4,1] | - | 1.2 · 1.8 / 2.0 |
| `charity` | pre, off, mid | cash ≥ .5 | Pay for a new gym / Run a free camp / Not now | 1: cash -min(50%, 2.5), fame +6, morale +8, `flags.gym` (write-only). 2: fame +3, morale +5, health -2. 3: morale -2. rep [3,2],[2,2],[-2,-1] | - | 2 · 4.2 / 4.7 |
| `family_money` | pre, off, early | cash ≥ 1 | Give it / Set up a trust for the family / Say no | 1: cash -min(.5, 20%), morale +3. 2: cash -min(.8, 25%), morale +6, **savvy**. 3: morale -5 | savvy | 2 · 4.0 / 4.3 |
| `investment` | pre, off | cash ≥ 1.5 | Go all in / Put in a little / Pass | 1: stake = min(40% of cash, 4); ok(savvy ? .45 : .3) → cash +1.8·stake (the stake is not deducted on a win), fame +2, else cash -stake, morale -5. 2: stake = min(10%, 1); 45% cash +1.5·stake, else -stake | reads **savvy** | 2 · 2.9 / 3.1 |
| `podcast` | off, pre | once; fame ≥ 45, seasonsDone ≥ 2 | Start it / Not while you are playing | 1: fame +8, cash +.4, then 30% trust -8. 2: trust +3. rep [3,-2],[-1,1] | - | 1.5 · 50% / 58% |
| `body_care` | pre, off | once; age ≥ 27, cash ≥ 1 | Buy the whole program / Just the chef / You are fine | 1: cash -min(1.2, 30%), dur +10, health +10, **`flags.longevity`**. 2: cash -.3, health +6, dur +4. 3: morale +1 | longevity: `develop()` decline ×.75 | 3 · 82% / 85% |
| `load_mgmt` | early, mid | age ≥ 30 and starter | Agree / Refuse. You play every night. | 1: rest +.15, health +8. 2: fame +3, health -6, risk +.03, trust +2 | - | 3 · 58% / 69% |
| `mentor_rookie` | early | age ≥ 29, seasonsDone ≥ 6 | Take him under your wing / Let him learn the hard way | 1: trust +6, morale +6, win +.3. 2: morale -1. rep [1,4],[0,-1] | - | 2 · 35% / 43% |
| `contract_year` | early | `contract.years === 1` | Get your numbers / Play winning basketball / Protect your body | 1: usage +.03, win -.4, trust -3. 2: win +.5, trust +5. 3: min -3, health +8, risk -.03 | - | 4 · 48% / 43% |
| `media_day` | pre | always (only reachable from season 2, because pre events need `seasonsDone > 0`) | MVP / Win games / Stay healthy | 1: fame +6, then morale +4 if ovr ≥ 85, else morale -3. 2: trust +4. 3: health +2. rep [2,-2],[1,3],[0,1] | - | 2 · 70% / 79% |
| `coach_fired` | mid | season l - w ≥ 8, a team, current coach not interim and ≥ 1 year in the job | Back {interim} / Ask for {bigname} / Stay out of it | **`queue` at deal time**: fires the coach, hires an assistant as interim, sets `flags.search={out, asst, big, other}`. 1: interim made permanent, trust = 62, win +.4. 2: 50% hire `big` (trust 55, win +1), else hire `other` (trust 40). 3: 50% interim kept, else `other`; trust = 50 | carousel state | 2.5 · 23% / 27% |
| `buzzer` | early, mid, late | `role.min ≥ 24` | Step-back three / Attack the rim / Draw a foul | `buzzer(p)`: p = .2+(sho-50)·.0065 / .24+((fin+ath)/2-50)·.006 / .22+(iq-50)·.006. Make: converts a loss into a win (if l > 0), fame +5, morale +8, trust +3, `flags.winners++` (write-only). Miss: morale -4 | - | 2.5 · 3.5 / 4.3 |
| `olympics` | off | `(year+1) % 4 === 0` and ovr ≥ 82 | Go for gold / Rest this summer | 1: health -10, fame +6, then 78% gold: `flags.olympic++`, `'olympic'` pushed onto the last history row's awards. 2: health +6 | - | **9** · 15% / 12% |
| `superteam` | off | ovr ≥ 84, `contract.years ≥ 1`, club net < 2 | Request the trade / Stay loyal | 1: `tradeNow(contender)`, fame +5. 2: morale +4, fame +2, trust +8. rep [-4,-2],[4,2] | - | 2 · 6% / 7% |
| `rap_album` | off | once; fame ≥ 50 | Drop it / Keep it for yourself | 1: 30% fame +10, cash +.6, else fame +4, morale -3. 2: morale +3. rep [3,-2],[-1,0] | - | 1 · 32% / 34% |
| `rehab_summer` | off | the season had `out ≥ 12` or age ≥ 31 | Rest / Work anyway | 1: health +14. 2: health -4, eth +4, sho +1 | - | 3 · 44% / 55% |
| `rival_trash` | early, mid | `rivalOn` (a rival exists and has not retired), fame ≥ 25 | Answer on the court / Answer online / Say nothing | 1: ok(.45+(ovr-rival.ovr)·.04) → fame +7, morale +6, `flags.rivalWins++`, else morale -6. 2: fame +5, trust -2, then 50% nothing, else morale -3. 3: trust +3. rep [1,3],[3,-3],[-2,2] | rivalWins appears on the Hall card | 2.5 · 3.1 / 3.2 |
| `rival_tv` | late | rivalOn, rival.ovr ≥ 74, ovr ≥ 74 | Guard him yourself / Outscore him / Make it about the team | 1: ok(.35+(def-70)·.02) → fame +6, def +1, rivalWins++, else morale -4. 2: ok(.4+(ovr-rival.ovr)·.04) → fame +8, morale +6, rivalWins++, else morale -5. 3: trust +4, win +.3 | rivalWins | 2 · 20% / 19% |
| `meet_someone` | off, pre | life.rel single and age ≥ 21 | Ask them out / Focus on basketball | 1: 70% rel = 'dating', since = year, morale +8, log "Met {partner}", else morale -2 and `life.pn++` (a new person next time). 2: eth +2 | moves to dating | 2.2 · 2.2 / 2.1 per career |
| `propose` | off, pre | dating and year - since ≥ 1 (the text says "Two years") | Propose / Not yet | 1: 85% rel = 'engaged', morale +10, else rel = 'single', morale -12, pn++. 2: morale -1 | engaged → wedding | 3 · 49% / 57% |
| `wedding` | off | engaged | Throw the party of the year / Something small | both set rel = 'married' and morale +10; option 1 also cash -min(1.5, 15%) and fame +4 | married → baby | **6** · 19% / 31% |
| `baby` | off, pre | married, kids < 4, age ≤ 38 | Start a family / After you retire | 1: kids++, morale +10, health -3. 2: morale -2 | - | 2 · 11% / 19% |
| `breakup` | off, mid | **dating only** (never engaged or married), and morale < 45 or fame > 70 | Fight for it / Let it go | 1: 55% morale +4, else single, morale -10, pn++. 2: single, morale -6, pn++ | - | 1.5 · 11% / 11% |
| `hometown_call` | off | once; `homeClub(L)` exists (road careers only, town in `HOME_CLUB`), team ≠ home club, ovr ≥ 74, `contract.years ≥ 1` | Go home / Stay where you are | 1: `joinTeam(home, trade)`, morale +15, fame +5, **`flags.home`**. 2: trust +6, morale -2. rep [3,1],[-1,0] | home → `cr.home` badge | 3 · 33% / 0% |
| `docuseries` | pre, off | once; fame ≥ 60 | Let them in / Produce it yourself / No cameras | 1: fame +10, cash +.8, then 40% trust -8, morale -3. 2: fame +7, cash +.4. 3: trust +3. rep [4,-2],[3,0],[-3,1] | - | 2 · 39% / 41% |
| `teammate_fight` | early, mid | `role.min ≥ 18` | Shove him back / Walk away / Settle it in a scrimmage | 1: 40% trust +2, morale +3, else rest +.04, trust -8, fame +3. 2: trust +4, morale -2. 3: ok(.5+(ovr-72)·.02) → trust +6, morale +5, else morale -4. rep [1,-4],[0,3],[0,2] | - | 1.6 · 2.1 / 2.4 |
| `young_star` | pre | once; age ≥ 31, a season exists, seasonsDone ≥ 8 | Mentor him / Make him earn it / Ask to be moved | 1: trust +8, min -2, morale +4, win +.3. 2: ok(.5+(ovr-76)·.03) → min +2, fame +3, else min -5, morale -6. 3: tradeAsk, trust -8. rep [1,4],[0,1],[-2,-2] | tradeAsk | 3 · 28% / 30% |
| `buyout` | mid | once; age ≥ 33, club net < 0, `contract.years ≥ 1` | Take it and join a contender / Finish it out | 1: cash -min(1.5, 10%), `tradeNow(contender)`, contract replaced by a 1-year minimum. 2: trust +5, morale -2 | free agency next summer | 3 · 8% / 8% |
| `christmas` | early | fame ≥ 45 and starter | Wear custom shoes and take over / Play your game | 1: ok(.35+(ovr-75)·.025) → fame +8, morale +6, else fame +2, morale -4. 2: trust +3, win +.2. rep [4,-2],[-1,2] | - | 2 · 42% / 47% |
| `agent_pitch` | off | once; seasonsDone ≥ 3 and agent ≠ power | Switch agents / Stay loyal | 1: `L.agent = 'power'`, morale +2. 2: morale +3 | the agent affects salary, fees and endorsements | 2 · 48% / 54% |
| `playoff_guarantee` | late | `season.seed ≤ 8` (set before late events are queued) and fame ≥ 35 | Guarantee it / One game at a time | 1: fame +6, then 55% win +.5, morale +4, else morale -3, trust -3. 2: trust +3. rep [3,-2],[-1,2] | - | 2.5 · 64% / 61% |

### 1f. Other things that happen with no card (beats and log)

- **Milestones** (`MILESTONES`, checked in `closeSeason`, each crossing once): pts 10k, 20k, 25k, 30k, 35k, 40k; reb 10k, 15k; ast 5k, 10k; gp 1000, 1300. Each is a beat, a log line and fame +3.
- **Rival** (`makeRival` at the draft, including undrafted; `rivalSeason` in every `closeSeason`): his rating moves on GROW/DECLINE, plus ppg, gp, All-Star (ovr+N(0,2) ≥ 87), MVP (ovr ≥ 92 at 12%), ring (3% + (ovr-75)·.4%, clamped 1-12%) and a 12% chance a year of changing club. Beats for an MVP, a ring and his first All-Star. He retires at age 34+ when ovr < 68 or at 25%, or at age ≥ 39.
- **Coaching carousel** (`coachCarousel` via `driftLeague` every new year; `midseasonFirings` at the All-Star break): a beat if the player's club changes coach (trust is reset to 50), plus up to 2 "Around the league" beats, with 3 lines kept in `flags.wire`.
- **Awards** (`awards()` at the `mid` step): mvp, an1/an2/an3, dpoy, ad1/ad2, roy, 6moy, mip, scor. Then `star` (an All-Star selection) and, from the playoffs, champ and fmvp. College awards (`colAwards`): c_aa1, c_aa2, c_npoy, c_allconf, c_cpoy, c_fr. HS awards and tournament awards (`closeAm`): hs_state, hs_allstate, hs_mrbb, hs_aag (rank ≤ 24 in grade 12), c_f4, c_champ, c_mop.
- Game beats: a career high of 30 or more, a 45-point night, a triple-double (`flags.tripleDoubles`, write-only), injuries, the draft line, trades, development, the play-in.

---

## 2. Section (1): the state model of a life `L`

Created by `newLife(opts)`. Opts are `seed, name, pos, arch, bg, num, start ('hs' | anything else), look, league`.

| key | holds |
|---|---|
| `v` | `LIFE_VERSION` (1). **Written and never read anywhere** (not in the engine, career-ui or scenes), so there is no migration path. Old saves are handled by lazy builders instead: `coachState`, `lifeOf`, `repOf`, and career-ui line 994, which patches in a missing `league.roster` |
| `seed` | a string. The default is `Math.random()·1e9`, so a career is non-deterministic unless the caller supplies a seed |
| `name` | at most 28 characters, default `randomName(seed)` (FIRST × LAST) |
| `pos` | PG/SG/SF/PF/C (default SF) |
| `arch` | `scorer/floor/twoway/slasher/stretch/anchor` (default twoway) |
| `bg` | `oad/senior/intl/gl`. Rewritten by `toDraft` on the road: cyear 1 → oad, cyear 2-4 → senior, intl, gl. Used only for the builder UI and the starting ratings |
| `agent` | `power/boutique/cousin` (default boutique until the agent card) |
| `num` | jersey number 0-99 |
| `age`, `year` | current age and season year (the season ending in `year`). Year one is `league.latest + 1` |
| `rt` | the seven ratings (25-99) |
| `pot` | ceiling (40-99) |
| `eth`, `dur` | work ethic and durability (0-100) |
| `m` | `{health, morale, fame, trust}` |
| `stage` | `'hs' \| 'col' \| 'pro' \| 'nba'` |
| `am` | road state: `{level 'hs'/'col'/'pro', grade 10-12, cyear 0-4, town, hs:{name,net,c1,c2}, rank, rstock, stock, college, route null/'college'/'intl'/'gl', declared, offers[], cv?, envelope?, proTeam?, proNet?, high?, tripleDoubles?, winners?}`. Null on a draft-night career. **Kept after the road ends** (it is read by `homeClub` and `{hscoach}`) |
| `amHist` | one row per amateur season: `{y, age, lvl 'HS'/'NCAA'/'Overseas'/'G League', school, ovr, w, l, finish, seed, rank, aw[], gp, min, pts, reb, ast, stl, blk, fgp, tpp, ftp}` |
| `cash` | $M in the bank |
| `earned` | lifetime $M (salary + endorsements + NIL + overseas) |
| `endorse` | last season's endorsement figure (write-only) |
| `endorseBonus` | *added later by `shoe_deal`*. A permanent bonus to annual endorsements |
| `team` | NBA club code or null (null before the draft and while overseas) |
| `contract` | `{years remaining, total, salary, kind 'rookie'/'min'/'vet'/'overseas', start, next?}`. `next` is an extension salary that applies once `years ≤ total` |
| `draft` | `{pick, round, team}`. Pick null means undrafted |
| `phase` | the step machine (section 3) |
| `pending` | queue of cards `{id, kind ('event'/'fa'/'clutch'/'presser'), key, eyebrow, title, text, options[{label, hint?, club?, slot?, agent?, school?, route?, tone?}], ctx?, topic?, named?}` |
| `log` | `{y, t, tone}`, capped at 400 entries |
| `history` | one row per NBA season: `{y, age, t, ovr, w, l, seed, po ('Champion'/'Missed'/'Play-in'/'R1'/'R2'/'CF'/'Finals'), aw[], sal, role, gp, min, pts, reb, ast, stl, blk, fgp, tpp, ftp}` |
| `flags` | see section 4 |
| `league` | `{latest, net{club}, stars{club:[3 names]}, roster{club:[[name,pos,born,ws]...]}, coach{club:{n,b,since,real,interim}}, free[{n,b,real,out,from,good}], gone[names, ≤120], gen, cy (the year the carousel ran), my (the year of midseason firings)}`. The coach fields are created lazily |
| `life` | `{rel 'single'/'dating'/'engaged'/'married', kids 0-4, since, pn (partner index, created lazily)}` |
| `rival` | `{name, pos, team, pick, age, ovr, pot, seasons[{y,age,team,ovr,pts,gp,aw}], retired, star, mvp, rings, pts, gp}` or null |
| `look` | whitelisted cosmetic keys (`LOOK_KEYS`) |
| `rep` | `{fans, resp}` 0-100. Both drift 20% back toward 50 at every `closeSeason`. The persona is derived from it (`personaOf`, a 3×3 table) and never stored |
| `season` | the current season, or null. NBA: `{year, team, g, w, l, gp, tot{...}, hi{pts,reb,ast}, out, injury{from,until,kind,pendingDecision}, mods{min,usage,perf,win,risk,rest}, used{}, acts{}, allstar, awards[], po, notes[], role, startOvr, startTeam, asked{}, seed?, recs?, table?, salary?}`. Amateur adds `{amateur, lvl, school, conf{w,l}, tourney, seed, qual, finish}`. `acts`, `notes`, `asked`, `startOvr`, `startTeam` and `injury.pendingDecision` are never read |
| `season.po` | `{cf, seed, round -1..3, results[], field{East,West}, out, champ, path, cur{round,opp,w,l,home,games[],waiting}}` |
| `seasonsDone` | the number of NBA seasons closed |
| `retired`, `final` | the end state. `final = {totals, score, verdict, blurb, jersey, rival, life, after}` |
| `steps` | the step counter. It seeds `{mate}`, `{opp}`, `{ref}` and `{rivalcoach}` picks |
| `last` | *added later by `choose`/`act`*. The last answer, for the screen |

**Save keys** (career-ui.js): localStorage `rtf.life.v1` = `{cur: L or null, hof: [Hall cards, newest first, ≤20], last: the card just finished}`. It is mirrored to the account shelf through `RTF_MODES_UI.write` (cloud slot `life`). Note that `load()` returns only `{cur, hof}`, so **`last` is written but dropped on reload**. Leaderboard: `boardSummary(L)` → `rtf_submit_career`; the server re-derives the score with `legacyScore`'s integer arithmetic. Badges: `featSummary(L)` → `badges.js careerFeats`.

---

## 3. Section (2): the step machine

`step(L)` returns `{beats:[], blocked:true}` if anything is pending, does nothing if retired, otherwise increments `steps` and dispatches on `phase`. `choose(L, i)` shifts the top card, runs it, and may change `phase`, push or unshift cards, or call the season machinery.

### Draft and NBA half

```
newLife(draft-night) ──► phase 'combine'  [card combine]
   choose combine ──► unshift workout ──► unshift agent ──► choose agent sets phase 'draft'
'combine' step     : no-op (unreachable in practice: always blocked by the combine card)
'draft'            : runDraft
                       ├─ pick ≤ 60 or promise → contract, joinTeam, phase 'drafted', openYear
                       │                          (training card, injury roll), draft presser if round 1
                       └─ undrafted → [card undrafted] → choose → phase 'drafted', openYear
'drafted' | 'pre'  : no team → overseasYear → phase 'off' [fa:back | nooffer2], or retire if age ≥ 37
                     else: games 1-27, rollInjury(mid), phase 'early', queue 'early' ×1-2
'early'            : games 28-55, rollInjury(late), allStarCheck [allstar], midseasonFirings,
                     phase 'mid', queue 'mid' ×1-2
'mid'              : games 56-82, standings, startPlayoffs (seed > 10 → out; 7-10 → round -1),
                     awards (+ mvp presser), pay(), phase 'late', queue 'late' ×1
'late'             : phase 'po'; if out → step() again; else playRound
'po'               : out → closeSeason, phase 'off', offseason()
                          (develop, contract-- , trade request, age ≥ 40 → retire,
                           [extension] [retire] [fa | nooffer], queue 'off' ×1)
                     else playRound: round -1 → playPlayIn (out, or seed 7/8 and round 0);
                                     rounds 0..3 → series; 3-3 → [clutch] (waiting) → endSeries;
                                     a loss → out (+ finals_loss presser if round 3);
                                     the Finals won → champion + title presser; else round++
'off'              : newYear (age++, year++, apply contract.next, null an expired contract,
                     driftLeague + coachCarousel, phase 'pre', openYear)
retire()           : phase 'after', pending = [after]
choose after       : retired = true, phase 'retired' (terminal; step returns no beats)
retireNow()        : with history → retire(); with no history → phase 'retired' immediately, no after card
```

### The road (high school, college, pro year)

```
newLife(start 'hs') ─► newRoad: stage 'hs', grade 10, phase 'hs_pre' [hs_summer] (+ hs_sum event 50%)
'hs_pre'  : hsRegular: 26 games (2 injury rolls), qual = w ≥ 13, phase 'hs_reg', queue 'hs' ×1-2
'hs_reg'  : hsPlayoffs: phase 'hs_po'; not qualified → closeAm; else runTourney (4 rounds, may pause [amclutch])
'hs_po'   : runTourney + closeAm. Effectively UNREACHABLE: the tournament finishes inside hsPlayoffs or inside choose(amclutch)
closeAm(hs): finish and awards, rstock, fame blend, amHist push, developAm, rank recomputed (+ hs_aag at grade 12),
             phase 'hs_off', hsOffCards: grade 11 [offers]; grade 12 [signing | commit]; queue 'hs_off' 55%
'hs_off'  : amNewYear (age++, year++, driftLeague):
              grade < 12 → grade++, new HS season, phase 'hs_pre' [hs_summer] (+ hs_sum 55%)
              route intl/gl → stage 'pro', am.level 'pro', phase 'pro_year'
              otherwise → stage 'col', cyear 1, colYear → phase 'col_pre' [training] (+ col_pre 65%)
'col_pre' : colStart: 12 non-conference games, phase 'col_early', queue 'col' ×1-2
'col_early': colConf: 19 conference games, phase 'col_mid', queue 'col' ×1
'col_mid' : colMarch: conference tournament (4 games, auto bid), Selection Sunday (seed ≤ 11 or auto bid), colAwards, phase 'col_late'
'col_late': tourney ? colTourney(upto 2) → phase 'col_po' : closeAm
'col_po'  : colTourney(upto + 2), then 4, then 6; done → closeAm (may push the ncaa presser; [amclutch] once)
closeAm(col): finish (c_f4/c_champ/c_mop), stock decays ×.5 + new, fame blend, amHist, developAm,
              phase 'col_off', colOffCards: cyear ≥ 4 → auto-declare, else [declare] (→ [portal]); queue 'col_off' 55%
'col_off' : amNewYear: declared → toDraft (route cyear 1 → oad, else senior); else cyear++ → colYear
'pro_year': proYear: 32 games, cash, iq +2, stock, amHist, developAm, age++, year++, driftLeague, toDraft(route)
toDraft   : stage 'nba', bg rewritten, team null, flags.stock += am.stock, phase 'combine' [combine] → the NBA half
```

---

## 4. Section (3): memory a later event reads (and what is not remembered)

### Flags with a reader

| key | written by | read by |
|---|---|---|
| `flags.stock` | combine and workout results; `toDraft` adds `am.stock` | `draftStock` → `projectedPick` → `runDraft`, the workout card, draftTalk |
| `flags.promise` | workout | `runDraft` (pick = the promised slot if `slot ≤ p+6`) |
| `flags.savvy` | vet_mentor (option 2), family_money (option 2) | investment, "Go all in" odds (.45 instead of .3) |
| `flags.longevity` | body_care (option 1) | `develop()`, decline ×.75 |
| `flags.tradeAsk` | coach_bench option 3, tank option 3, young_star option 3, ACTS trade | `offseason()` (forced trade if `contract.years > 0` after the decrement); blocks trade_rumor and the trade act |
| `flags.extAsked` | the vext card is dealt | gates vext; reset when the contract expires |
| `flags.search` | coach_fired `queue` | `{firedcoach}`, `{interim}` and `{bigname}` tokens; coach_fired options |
| `flags.leave` | coach_leaves `queue` | `{oldcoach}` and `{leaveclub}` tokens |
| `flags.rivalWins` | rival_trash, rival_tv | `legacy().rival.beat` (Hall card) |
| `flags.rings` | `endSeries` | the ring-number beat text only (totals count rings from history) |
| `flags.allstars` | allStarCheck | the ordinal in the All-Star beat |
| `flags.careerHigh` | playChunk | career-high beats |
| `flags.home` | hometown_call | `featSummary.home` → badge `cr.home` |
| `flags.g7` | clutch made | `featSummary.g7` → badge `cr.g7` |
| `flags.once` | queueEvents | `once` events |
| `flags.offUsed` | queueEvents | the `used` map when there is no season (rare; see section 0) |
| `flags.acts` | act() | once a year per action |
| `flags.momHouse`, `flags.foundation` | ACTS | once per career for those acts |
| `flags.wire` | coachCarousel | `view().wire` |
| `flags.debutSeen` | scenes.js | scenes.js (the debut cutscene) |
| `L.endorseBonus` | shoe_deal | `pay()` every season |
| `L.agent` | agent card, agent_pitch | salary, fee, endorsements, `{agent}` |
| `L.life.rel / kids / since / pn` | life cards | the gates on meet_someone, propose, wedding, baby and breakup; the `{partner}` identity; lifeLine; the cr.family badge |
| `L.rep` | presser tones, EVENT_REP | `personaOf` (the identity card); nothing in the engine gates on it |
| `L.rival` | makeRival, rivalSeason | rival_trash and rival_tv gates and odds, legacy, the cr.rival badge (points comparison) |
| `am.envelope` | street_agent option 2 | investigation (`when`); cleared by it |
| `am.rstock` | hs_summer, mixtape, rival_school, prep_transfer, camp_invite, closeAm(hs) | `recruitScore` → `am.rank` → college offers, commit options, prep_transfer and camp_invite gates |
| `am.stock` | nba_scouts, rivalry_col, booster, coach_leaves, investigation, closeAm(col), proYear | projectedPick (declare, portal, draftTalk), `toDraft` → `flags.stock` |
| `am.college / route / declared / cyear / grade / hs` | recruiting cards | the step machine and the gates on coach_son, freshman_wall, roommate, coach_leaves |
| `am.cv` | coach_leaves | `colCoachName` (a new college coach) |
| `am.town` | newRoad | `homeClub` → hometown_call |
| `season.mods.*` | most in-season events | the rest of that season only (see section 7 for the timing holes) |

### Write-only (stored and never read by the engine, career-ui, scenes or badges)

`flags.tripleDoubles`, `flags.dunk`, `flags.threes`, `flags.winners`, `flags.press`, `flags.gym`, `flags.moved`, `flags.olympic` (the medal is counted from history instead), `flags.restYears`, `flags.overseas`, `am.tripleDoubles`, `am.winners`, `am.offers`, `L.endorse`, `L.v`, `season.acts/notes/asked/startOvr/startTeam`, `injury.pendingDecision`. `flags.hsName` is the reverse case: it is **read** (the `{hscoach}` fallback) but **never written**.

### Explicitly NOT remembered

- **What you answered.** No card records its choice. The exceptions are the flags above, plus the cosmetic `L.last`. Owning a film session, confronting a heckler, a podcast, a docuseries, refusing to tank, guaranteeing a series and almost every other answer change numbers once and are then forgotten. No later event refers back to them.
- **Which events you have seen**, beyond one season (`season.used`) or the `once` list. A recurring event (night_out, slump, hot_streak, charity, family_money and so on) comes back with the same text the next season, with no memory of the previous answer.
- **Relationships:** coaches, teammates and GMs keep no opinion of you. Only the `trust` meter, which `joinTeam`, the carousel and coach_fired reset, and which `closeSeason` blends toward performance.
- **Amateur reputation:** rep never moves on the road. Recruiting events don't remember the street agent beyond the envelope. HS and college rivals are generated per line and never persist.
- **A marriage never ends.** A breakup is possible only while dating.
- **The rival's opinion of you**: he exists only as a stat line.
- **Pressers:** only the rep and meter deltas remain. The tone is not stored, beyond `flags.press` (a count).
- **Injuries** after the season: the history keeps only games played (and `out` feeds rehab_summer that summer). No chronic damage beyond the `dur` and `ath` deltas.

---

## 5. Section (4): end states and verdicts

### `verdictOf(score)` / `VERDICTS`, checked in this order

| score ≥ | verdict | blurb |
|---|---|---|
| 120 | Inner circle | One of the greatest to ever play. |
| 85 | First ballot | The Hall calls the first year you are eligible. |
| **55** | **Hall of Famer** (the HOF threshold) | Springfield, eventually. Bring a suit. |
| 36 | On the ballot | A real case. The voters will argue about you. |
| 18 | A good career | Paid, respected, remembered in your city. |
| 0 | Journeyman | You made it. Most never do. |
| (no history) | Never made the league | The game gave you a lot. The league never called. Reachable only through `retireNow()` before the first NBA season closes |

`legacyScore` in integer ten-thousandths, rounded half up: pts·1.4/1000 + reb·.5/1000 + ast·.7/1000 + rings·4 + mvp·13 + fmvp·6 + an1·5 + an2/an3·2.5 + star·2 + dpoy·4 + roy·2 + olympic·2 + ncaa·2 + npoy·3 + aa1·1. These are **not scored**: 6moy, mip, ad1/ad2, scor, c_aa2, c_allconf, c_cpoy, c_fr, c_f4, c_mop, hs_* (`T.state` is counted in totals but never weighted).

A **retired jersey** needs at least 7 seasons with one club and a score of at least 36.

**Retirement triggers** (the log line): "Retired at N." (retire card, nooffer, retireNow); "The body made the call at N." (forced at age 40 in `offseason`; never reached in the simulation); "Retired overseas at N." (forced at age 37 in `overseasYear`). Each is followed by the verdict name.

### After-retirement sentences (`chooseAfter`): 11 distinct

| choice | condition → sentence |
|---|---|
| Coach | iq ≥ 72 and rng < .6 → (rng < .4 → "You became a head coach and won a title from the bench." : "You became a head coach."), otherwise "You became an assistant coach. The players love you." |
| Television | fame ≥ 55, or "big" (≥ 3 All-Star selections, an MVP or ≥ 2 rings) → "You became the voice of a national broadcast." : "You did local TV for your old club. Every night." |
| Front office | rng < .45 + (iq-60)·.01 → "You became a general manager and built a contender." : "You ran scouting for a decade. Two of your picks became All-Stars." |
| Business | cash ≥ 20 and rng < .5 → "You bought a piece of an NBA team." : cash ≥ 3 → "You built a business. Restaurants, then real estate." : "You opened a gym in your hometown." (2 of 600 in the simulation) |
| Go home | "You went home. You coach your kids now." |

The Hall card also carries `lifeLine` (Single / Dating / Engaged / Married to {partner}, plus 0-4 kids, which is 4 relationship states × 5 kid counts, though only married can have kids), the rival comparison and the jersey. Distinct endings: **7 verdicts × 11 after-sentences** (plus the after-less "Never made the league"), 3 retirement triggers, 9 personas.

Measured verdict spread (600 random-policy careers): Journeyman 121, A good career 232, On the ballot 88, Hall of Famer 72, First ballot 62, Inner circle 25.

---

## 6. Section (5): RNG and seeding

- `rngAt(L, tag)` = `E.createSeededRNG(E.hashSeed(seed + ':' + L.year + ':' + tag))`. Every draw is keyed to the life seed, the season year and a tag. There is no stored stream and the clock is never read. The one exception is `newLife` with no `seed`, which uses `Math.random`.
- Creation uses `seed + ':create'` for ratings, pot, eth, dur, num and (on the road) the town, HS colours and net. Names use `'name:' + seed`.
- People: `personName` = `seed + ':who:' + key` and `kinName` = `seed + ':kin:' + key`. These are year-independent, so people are stable. Keys that do vary: `reporter:year`, `scout:year`, `ref:steps`, `campcoach:year`, `partner:pn`. Teammate picks (`{mate}`, `{mate2}`) and `{opp}`, `{rivalcoach}` use `rngAt('mate:a:'+steps)`, `'opp:'+steps` and `'rc:'+steps`, so they are stable within a step. A card is named once, when it reaches the top (`named`), so a card is never renamed later.
- Rookies: `seed:rook:club:draftyear`. Retirement ages: `seed:ret:name`.
- **Answering a card:** `rngAt('pick:' + card.key + ':' + optionIndex)`. The outcome is fixed per (seed, year, card key, option). A reload and the same choice reproduce it exactly; a different option draws a different stream.
- Dealing: `rngAt('ev:' + phase + ':' + pending.length)`. The count of cards dealt uses its own tags (`n:early`, `n:mid`, `n:pre`, `n:sum`, `n:hs`, `n:c1`, `n:cpre`, `n:off`).
- Season sim tags: `games:chunk`, `inj:chunk`, `table`, `awards`, `allstar`, `playin`, `bracket`, `srs:cf:r:ab`, `series:round:gamesPlayed`, `fmvp`, `develop`, `offers`, `draftnight`, `lottery`, `drift`, `carousel`, `midfire`, `cfire`, `rival`, `rivalyr`, `tradeask`, `overseas`, `act:id`. On the road: `am:tag`, `aminj:tag`, `tg:kind:r`, `conft`, `colaw`, `amclose`, `pronet`, `sch:name`, `offers:tag`.
- **Correlations:** `colStart` and `colConf` both call `queueEvents(...'col'...)` in the same year, usually with `pending.length === 0`, so both use the identical stream `ev:col:0`. Their first draws are equal and the second deal is correlated with the first (only the eligible list differs). `develop` and `developAm` share the tag `develop`, but never in the same year. Within a year `rngAt('offers')` (NBA free agency) and `offers:jr` and similar (college) are distinct strings.

---

## 7. Section (6): bugs, dead code, unreachable paths, convergence

### Bugs, confirmed by a probe (`a probe script`, 600 careers)

1. **An injured or benched player takes the Game 7 shot.** `continueSeries` pushes the `clutch` card at every 3-3 without checking `s.injury` or `role.starter`. In the probe, 56 of 2,933 Game 7s went to a player injured through the playoffs (`injury.until > 86`) and 538 to a non-starter. The road's `amclutch` correctly requires `playing && role.starter`. A related point: every NBA Game 7 is decided by one shot at 12-58%, whatever the gap in team strength.
2. **`late` events run after the season is over.** The `mid` step plays games 56-82, computes standings, seeds and awards, and only then queues `late` events. As a result:
   - `buzzer` in `late` flips a loss to a win after seeding: 258 records in the probe no longer match the seeding they were given, and the history row records the altered W-L.
   - The `min`, `usage`, `rest` and `risk` mods from `late` cards (tank "minutes limit for the rest of the year", hot_streak usage, injury_tweak rest and risk, heckler suspension) do nothing. Only `win` and `perf` reach the playoffs.
3. **The same hole on the road.** `'hs'` events are queued only after all 26 regular-season games. coach_son's `min +6`/`+5` ("By February you are starting") and grades' "sit three games" (`rest`) are dead. `rest` is also ignored by `colMarch` and `runTourney`, so `'col'` cards dealt at `col_mid` cannot suspend anyone (booster, investigation, class_skip). `min` is dead there too, because `colMarch` reuses `s.role`.
4. **A stale trade request survives free agency.** `offseason()` grants and clears `flags.tradeAsk` only `if (c && c.years > 0)`. A request made in the final contract year (coach_bench, tank or young_star) is never cleared. The player re-signs or signs anywhere, and is then forcibly traded the following summer. Meanwhile trade_rumor and the trade act stay locked. The probe found 51 free-agency signings made with a stale request.
5. **The Olympics are a year off.** The gate is `(L.year + 1) % 4 === 0`. `L.year` is the season ending in that year (newYear's beat prints "(year-1)-(year) season"), so the card fires in the summers of 2027, 2031 and so on, not 2028 and 2032 (the probe found `year % 4 === 3` every time). The condition should probably be `L.year % 4 === 0`.
6. **`makeRival` cannot exclude your club.** It filters `CLUBS.filter(c => c !== L.team)`, but it runs before `joinTeam`, so `L.team` is null (or the previous null after `toDraft`). The rival can start on your own team.
7. **The promise can push you down the board.** `runDraft` uses the promise whenever `promise.slot ≤ p + 6`. A guaranteed promise from the proj+7 club therefore moves a player who would have gone at proj+1 through proj+6 down to proj+7. Whether that is intended is unclear: the card says "if you are there".
8. **The rest summer lies.** The `training` "Rest and recover" hint says "Slower decline", but its only lasting effect is `flags.restYears++`, which nothing reads. Only body_care's `longevity` slows decline.
9. **Restricted free agency is cosmetic.** The "rfa" eyebrow appears, but the own club has no matching rights.
10. **The workout card can lie about its count.** Its title is always "Three teams want you in", but de-duplication by club (the draft order repeats a club, and early picks clamp) can leave 1-2 options.
11. **The propose text is wrong.** It says "Two years with {partner}" but the gate is `year - since ≥ 1`, and it can fire about one summer after meeting.
12. **The overseas year skips development.** It applies a flat ±1-3 to every rating, runs no `develop()`, no health refill and no `rivalSeason`, and leaves no history row (so no season counts toward the Hall). Separately, `overseasYear` refuses NBA offers at age 34 or over even when some exist.
13. **`retireNow()` drops the season in progress.** It is never written to history. Before the first season closes, a drafted player retires as "Never made the league".
14. **career-ui drops `last` on reload.** `load()` keeps only `{cur, hof}`, so a `last` card that was saved is lost after a reload (this affects the board-id lookup at career-ui 919/927).
15. **The coaching-search outcome is fixed at deal time.** coach_fired's and coach_leaves' `queue` fire and hire the moment the card is dealt, not when it is answered. If `retire()` or another path clears the pending queue, the coach is still gone.

### Dead code and unreachable paths

- The `step` case `'combine'` is a no-op: that phase is always blocked by the combine card.
- The `step` case `'hs_po'` is effectively unreachable: the HS tournament finishes inside `hsPlayoffs` or inside `choose(amclutch)`, which calls `closeAm`.
- The `peopleKey('hscoach')` fallback `L.flags.hsName` is never set. A draft-night career gets the generic `hscoach:hs` person.
- The comment on `PAIRS` mentions a `skip` parameter that does not exist. `R_POS` is a pointless alias. The helper `const age = (L) => L.age` is unused. `L.v` and `CAREER_API_VERSION` are never compared.
- The write-only state listed in section 4.
- `EVENT_REP` covers 20 of the 47 events. The other 27 NBA events and all 20 road events never touch reputation, so the persona is driven mostly by pressers and those 20 cards.
- Never reached in the simulation: the age-40 forced retirement; the 40,000-point milestone; "You opened a gym in your hometown" (2 of 600).
- Rare: undrafted (2% of road careers, 0% of draft-night careers); superteam (6-7%); buyout (8%); investigation (7%); coach_son (10%); the MVP presser (about 2%); the ncaa presser (about 5% of road careers). No event in `EVENTS` or `AM_EVENTS` was never dealt across 600 careers.

### Where careers converge to the same content

- **The same skeleton every year.** Every NBA season deals a `training` card with identical text and options (about 15 per career), 3-5 in-season events and an `off` event. Every career walks combine → workout → agent → draft.
- **A handful of events dominate.** Recurring events have no `once` flag and only a per-season `used` check. Per career: night_out about 6×, slump 5-6×, hot_streak 4-5×, film_session 4-5×, charity about 4.5×, family_money about 4×, local_ad about 4×, buzzer 3.5-4.3×, online_beef about 3.5×, ref_heat about 3.5×, rival_trash about 3×. The text is static and ignores the real season (hot_streak always says "Thirty points three straight nights", slump always "Twenty-six percent from three for a month").
- **Game 7.** The `clutch` card appears about 4.4 times per career with identical copy.
- **The road.** Every road career gets exactly 3 hs_summer cards, an offers card and a commit/signing decision. College years repeat training plus the `col` pool.
- **The life arc is one-way and short.** single → dating → engaged → married → kids, with no divorce, no partner identity beyond a generated first name, and no effect on basketball beyond morale and health.
- **Few endings.** There are 11 after-sentences (Go home always gives the same one), and the verdict ladder has 6 rungs. Two careers with similar totals end on the same card text.
- **Life events and hometown_call need a road career.** hometown_call needs `am.town`, so draft-night careers never see it (0% measured).
