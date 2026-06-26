# Run The Tour — Career Mode Spec (aging, retirement, generated players)

Reference doc for career mode. Assumes the repo, `golfers.json`, and the sim are in place.
Dev-only; no deploy without approval; surface decisions rather than guessing.

---

## 0. Two modes, one roster

- **Arcade / standard** (the current game): spin and draft from the full **peak-card** roster. Timeless — Tiger is
  always 95. Aging does NOT apply. `potential` is shown as a card stat only.
- **Career**: a **living world** that starts in 2026 and simulates year by year. Players age, decline, retire;
  generated rookies rise. **Each career save is its own world** (its own RNG seed — see §6). The year-42 bug
  (still competing with peak Tiger) is fixed here by aging + retirement together.

The roster card (peak skills) is the *draft/identity* layer. Career derives a separate **living rating** that
changes every sim year. Never mutate the card values in place — keep peak skills immutable and compute living
ratings into a per-save career state.

---

## 1. Data fields (already in `golfers.json`)

Each golfer now has:
- `born` (year), `potential` (ceiling overall at peak), `arc_age` (the age the stored card skills represent:
  current players = their 2026 age; legends = their peak-season age).
- the 8 peak skills + `overall` (the card).

Derived at load (do this once per golfer):

    skill_potential[s] = clamp(stored_skill[s], 99, round(stored_skill[s] / arc(s, arc_age)))

That gives each golfer's per-skill ceiling. `potential` (overall) is the weighted average of those, already
stored for display. (clamp keeps a ceiling at/above the stored value and <= 99.)

---

## 2. Aging arcs (the heart of progression)

Each skill ages on its own normalized curve (peak = 1.0). Distance fades first; composure rises with experience
and barely declines; short game and putting age slowly. Params: `(young_floor, peak_start, peak_end, dec1/yr,
dec2_age, dec2/yr)`.

| skill | young_floor | peak_start | peak_end | dec1/yr | dec2_age | dec2/yr |
|---|---|---|---|---|---|---|
| dist | 0.95 | 23 | 28 | 0.011 | 40 | 0.022 |
| acc  | 0.89 | 29 | 35 | 0.004 | 46 | 0.010 |
| app  | 0.86 | 28 | 34 | 0.006 | 44 | 0.014 |
| sht  | 0.88 | 29 | 38 | 0.004 | 47 | 0.010 |
| scr  | 0.88 | 29 | 38 | 0.004 | 47 | 0.010 |
| bnk  | 0.88 | 29 | 38 | 0.004 | 47 | 0.010 |
| put  | 0.89 | 27 | 34 | 0.005 | 45 | 0.012 |
| clu  | 0.80 | 34 | 44 | 0.002 | 50 | 0.006 |

```
arc(s, age):
    fl, ps, pe, d1, d2a, d2 = ARC[s]
    if age <= ps:  return clamp(fl, 1.0, fl + (1-fl)*(age-16)/(ps-16))   # development rise from 16
    if age <= pe:  return 1.0                                            # plateau
    return max(0.45, 1.0 - d1*(min(age,d2a)-pe) - d2*max(0, age-d2a))    # two-stage decline
```

**Living rating each career year** (age = sim_year − born):

    living_skill[s] = clamp(40, 99, round(skill_potential[s] * arc(s, age)))
    living_overall  = round( Σ living_skill[s] * weight[s] )

weights: dist .11, acc .12, app .21, sht .10, scr .08, bnk .06, put .19, clu .13.

Effect: a 19-year-old enters with good distance, weak composure/approach, and climbs toward `potential` through
his 20s; a 40-year-old has lost distance but kept short game, putting, and composure; a 50-year-old is well down
and usually retired (§3).

---

## 3. Retirement

After aging each year, roll retirement per active golfer (seeded RNG). Probability rises with age and with a
rating that has fallen too low to keep a card.

```
p_retire(age, living_overall):
    if age < 37:  p = 0.00
    elif age <= 44: p = 0.01*(age-36) + (0.06 if living_overall < 74 else 0)   # 1%..8%
    elif age <= 49: p = 0.10 + 0.06*(age-45) + (0.10 if living_overall < 76 else 0)  # 10%..34%
    elif age <= 54: p = 0.40 + 0.10*(age-50)                                   # 40%..80%
    else: p = 1.0                                                             # hard retire at 55
    return min(1.0, p)
```

A still-elite 48-year-old (living_overall high) can hang on (Phil/Stricker types); a faded 44-year-old below 74
usually steps away. Retired golfers leave the active field and move to a career "alumni" list (still draftable
in arcade, never in the career field).

---

## 4. Career field seeding (year 0 = 2026)

The living field is NOT the peak-card roster. Seed it as:
- **All `data_source = current` players** + the **young real prospects** (born >= 2000), each at their living 2026
  rating (age-accurate). These age forward.
- **Legends** (historical-peak + old reputation) are **not** in the living field — at 2026 ages they're retired.
  They stay in the arcade draft pool and the alumni list. (A handful of recently-active vets near 2026 will fall
  out naturally via §3 within a few years.)

Maintain a target active pool (≈ 200 cardholders, or match the field size used by the sim/§"calibrated field").
Each year: age everyone → retire per §3 → refill to target with generated rookies (§5).

---

## 5. Generated players (the draft-class engine)

Each career year, generate a rookie class to refill retirees + churn (≈ 30–45 rookies/year; most are
role-players, a few are real). Mirrors NBA 2K / The Show / NCAA recruiting.

Per rookie:
1. **Nationality** — weighted draw (approx PGA Tour demographics):
   USA .34, England .08, Australia .06, South Korea .06, Japan .05, South Africa .04, Spain .03, Sweden .03,
   Canada .03, Ireland .025, Germany .02, Argentina .02, France .02, Italy .015, Denmark .015, Korea(other)/rest .14.
2. **Name** — random first + surname from that nationality's banks (§5a); reroll on collision with any real or
   already-generated name. Combination of modest banks yields hundreds of unique names per region.
3. **Entry age** — randint(18, 22). `born = sim_year − entry_age`, `arc_age = entry_age`.
4. **Potential** — skewed so stars are rare:
   - 70%: gauss(80, 2.5)  → role players
   - 20%: gauss(85, 1.5)  → solid tour pros
   - 8%:  gauss(89, 1.5)  → stars
   - 2%:  gauss(92.5, 1.5) → generational
   clamp 70–96.
5. **Archetype** — weighted pick: all-rounder .30, bomber .18, ball-striker .18, putter .12, short-game .12,
   scrambler .10. Sets which skill ceilings are elevated.
6. **Skill ceilings** — distribute `skill_potential[s]` so the weighted average ≈ potential, with the archetype's
   signature skill(s) +6..+12 above the others and small per-skill noise (±2). Composure ceiling moderate-high
   (it grows in); distance ceiling high for bombers.
7. **Entry skills** — `skill[s] = round(skill_potential[s] * arc(s, entry_age))` so they enter raw (low composure,
   maybe already-long). `data_source='generated'`, `fictional=true`, rarity by potential tier.
8. **Development variance** — give each rookie a hidden `growth_mod ~ gauss(0, 2)` applied to realized ceilings,
   plus a small **bust chance** (~12%) that caps their growth ~4–6 below potential. So not everyone hits their
   ceiling and worlds stay unpredictable. (Optional: rare "late bloomer" that overperforms.)

Players whose living rating stays below the pool cutoff for ~3 years lose their card (mini-retirement), keeping
the pool fresh without manual culling.

### 5a. Name banks (starter — expand freely)

Provide per-nationality first-name and surname lists. Starter examples (Coby: extend each to 30–60 for variety):

- **USA** first: Cole, Hayden, Brooks, Tanner, Carson, Bryce, Tripp, Mason, Reid, Cooper, Parker, Beau, Grant, Knox.
  surnames: Whitaker, Sutter, Calloway, Hargrove, Lindquist, Boone, Marsh, Pruitt, Vance, Ellison, Stamper, Roark.
- **England** first: Ollie, Harry, Charlie, Reece, Freddie, Tom, Joe, Alfie. surnames: Ashworth, Pemberton, Whitlock,
  Hartley, Bardsley, Cresswell, Fairbanks, Holloway.
- **Australia** first: Kai, Lachlan, Beau, Jett, Cooper, Flynn. surnames: Calvert, Mwillar, Hueston, Bracken, Donato.
- **South Korea** first: Minjae, Seungwoo, Jihun, Doyoon, Taeyang. surnames: Kang, Seo, Yoon, Jung, Hwang, Lim.
- **Japan** first: Riku, Sota, Haruto, Yuki, Ren. surnames: Takeda, Morita, Fujikawa, Nishida, Okamoto.
- **South Africa** first: Dewald, Ruan, Jaco, Stefan. surnames: Pretorius, Coetzee, Van Wyk, Bekker, Lategan.
- **Spain** first: Pablo, Álvaro, Mateo, Hugo. surnames: Cabrera, Otero, Reyes, Castaño, Bermúdez.
- **Sweden** first: Filip, Albin, Hugo, Melvin. surnames: Ahlberg, Sjöberg, Lindkvist, Norén, Hammar.
  (Add Canada, Ireland, Germany, Argentina, France, Italy, Denmark similarly.)

---

## 6. Each save is its own world

A new career gets a random `career_seed`. Seed ALL randomness from it — prospect generation, retirement
rolls, development variance, and the season sim. Two careers from the same 2026 start must diverge, and any
single career must be reproducible from its seed. Persist the full career state per save (living ratings,
ages, alumni, generated players, seed, current sim_year).

---

## 7. Build order

1. Load-time derivation of `skill_potential` + the `arc()` function and living-rating computation (§1–2).
2. Year advance: age → recompute living ratings → retire (§3).
3. Field seeding for year 0 (§4).
4. Generated-player engine (§5) + name banks.
5. Per-save seeding & persistence (§6).
6. Wire living ratings into the season sim / calibrated field (a career event uses living_overall, then course
   fit on top).

Keep arcade mode untouched (peak cards). Don't deploy without approval. Surface tuning choices (pool size,
rookies/year, retirement curve) rather than guessing.

---

## Implementation status (this repo, dev branch)

**Done (build-a-golfer.html).** §1 aging arcs + `skill_potential`/living ratings; §2 `ageArc`/`livingOf`;
§3 retirement (`pRetire`) + alumni list; §4 living-field seeding (year0=2026 from `data_source=current` +
born≥2000 prospects, legends excluded); §5 `genRookie` draft-class engine + per-nationality name banks
(`FNAMES`/`SNAMES`), archetype/potential/entry-skill/growth-bust variance; §6 per-save `careerSeed` driving
all career RNG, world persisted in the career save and resumed exactly (new careers diverge); §7 wired:
non-daily season fields use the living world (`worldField`, top-N by living overall), course fit on top; the
spin/draft pool stays the timeless **peak-card roster** (arcade identity preserved); daily unchanged.

**Tuning choices made (surface for review):** WORLD_TARGET=150 (pool refilled to this each year); season field
= top (FIELDSIZE−1=119) by living overall; rookies generated only to refill to target (≈ retirees + churn).
Validated: 2026 field mean 82.5 (≈ prior calibration), stable ~82 across 9 yrs; peak Tiger ages out of the
field (year-42 bug fixed). Name banks are starter-sized (~10–24/nationality) — easy to expand.

**Design note:** the game has one season flow; "Career Mode" = the multi-year franchise. Rather than a
separate arcade-vs-career toggle, the **draft** is always peak cards (timeless) and the **field** is the living
world. A distinct peak-card-field arcade mode can be added later if wanted.
