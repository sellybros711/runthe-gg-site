# Run The Tour — Career Mode Spec (one bounded career, lived in its own universe)

Reference doc for Career mode. Assumes the repo, `golfers.json`, and the sim are in place.
Dev-only; no deploy without approval; surface tuning choices rather than guessing.

---

## 0. The shape of Career mode

- **Arcade / standard** (current game): spin and draft the full **peak-card** roster. Timeless — Tiger is always
  95, no aging. `potential` shows as a card stat only.
- **Career**: you create one golfer and play their **entire career, start to finish**, in a world that starts
  2026 and **ages forward as you play**. Your golfer rises, peaks, declines, and **retires** — and when they
  retire, **the career ends and the next one is a full reset**: brand-new 2026 universe, new seed, new story.
  The character is the point; there is no persistent dynasty carried across golfers.
- **Each career is its own universe.** A fresh `career_seed` drives ALL randomness. The starting roster is the
  same every time (recognizable real names at fixed starting points), but **trajectories vary every run** — who
  develops into a star, who busts, which invented rookie takes over. Same inputs, different story. That variance
  is the replay engine.

The roster card (peak skills) is the immutable *identity* layer. Career computes a separate **living rating** per
run. **Never mutate card values** — keep peak skills immutable; compute living ratings into per-career state that
is discarded on reset.

This fixes the old "year-42 still competing with peak Tiger" bug two ways: aging + retirement age real stars out
within your run, and the run ends at your golfer's retirement anyway.

---

## 1. Data fields (in `golfers.json`)

Each golfer has: `born`, `overall` + 8 peak skills (the card), `arc_age` (age the card skills represent),
`potential` (expected ceiling, for display/arcade), and **`pot_band`** = `{lo, hi, exp, boom, bust}` — the
per-career potential range.

- Established players have **tight** bands (their story is mostly told). Teens/early-20s have **wide** bands with
  real boom and bust tails. Talent shifts `exp` and the odds, never guarantees the outcome.

---

## 2. Rolling potential per career (the variance engine)

At the **start of a career**, roll each developing golfer's actual peak potential from their band, seeded by
`career_seed`. This is what makes Miles Russell a different player each universe.

```
roll_potential(band, rng):
    r = rng.random()
    if r < band.bust:        return uniform(band.lo, band.exp-1)   # undershoot toward floor
    if r > 1 - band.boom:    return uniform(band.exp+1, band.hi)   # overshoot toward ceiling
    return clamp(band.lo, band.hi, gauss(band.exp, (band.hi-band.lo)/6))   # land in expected band
```

Roll once per developing golfer at career start; that becomes their `career_potential` for this run. Established
players (tight band) effectively keep `exp`. Distribute the rolled overall potential back across the 8
`skill_potential[s]` proportionally to the card's shape (keep the player's archetype identity), then aging (§3)
governs how they reach it.

**Tuning the dice:** talent must tilt odds, not flip coins. A teen like Russell busts ~25–30% / booms ~20%,
lands in his band the rest — betting on him is smart but never safe. Don't widen so far that talent stops
mattering; don't tighten so far that every career is identical. This is the central feel dial — playtest it.

---

## 3. Aging arcs

Each skill ages on its own normalized curve (peak = 1.0). Distance fades first; composure rises with experience
and barely declines; short game and putting age slowly. Params `(young_floor, peak_start, peak_end, dec1/yr,
dec2_age, dec2/yr)`:

| skill | floor | peak_start | peak_end | dec1/yr | dec2_age | dec2/yr |
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
    if age <= ps:  return clamp(fl, 1.0, fl + (1-fl)*(age-16)/(ps-16))
    if age <= pe:  return 1.0
    return max(0.45, 1.0 - d1*(min(age,d2a)-pe) - d2*max(0, age-d2a))
```

At load, `skill_potential[s] = clamp(stored_skill[s], 99, round(stored_skill[s] / arc(s, arc_age)))`, then
override with the §2 career roll. Each year (age = sim_year − born):

    living_skill[s] = clamp(40, 99, round(career_skill_potential[s] * arc(s, age)))
    living_overall  = round( Σ living_skill[s] * weight[s] )      # weights: dist.11 acc.12 app.21 sht.10 scr.08 bnk.06 put.19 clu.13

A developing player also climbs toward their rolled potential over a few seasons rather than jumping — ease the
realized skills toward the arc target so growth feels earned.

---

## 4. Retirement (ends real players' runs — and yours)

After aging each year, roll retirement per active golfer (seeded). Your created golfer retires the same way —
that retirement **ends the career and triggers reset**.

```
p_retire(age, living_overall):
    if age < 37:    p = 0.00
    elif age <= 44: p = 0.01*(age-36) + (0.06 if living_overall < 74 else 0)
    elif age <= 49: p = 0.10 + 0.06*(age-45) + (0.10 if living_overall < 76 else 0)
    elif age <= 54: p = 0.40 + 0.10*(age-50)
    else:           p = 1.0     # hard retire at 55
```

A still-elite 48-year-old can hang on; a faded 44-year-old steps away. On your golfer's retirement, show a
career-summary ceremony (earnings, wins, majors, best season) — a real ending, not a game-over wall — then offer
**New Career** (fresh universe). Earnings/leaderboard entry is the **completed career total**; since every career
is a bounded run from the same 2026 baseline, totals are comparable and the board stays a fair fight (no
infinite-grind wall). The big addictive number is "best career ever," and it's beatable.

---

## 5. The field ages forward within your run

- Year 0 (2026): living field = `data_source = current` players + young real prospects, at their living 2026
  ratings. Legends are retired (arcade-only).
- Each year: age everyone → roll retirements (§4) → refill to the target pool (~200) with generated rookies (§6).
- Over a ~20-year career the tour turns over once: the real kids you started with grow up (per their rolled
  potential), real vets retire, invented players fill in. By your own retirement the leaderboard is a mix of
  developed real players and generated stars — and it's different every universe.

---

## 6. Generated players (the rookie-class engine)

Each year, generate a rookie class (~30–45) to refill retirees + churn. Mirrors The Show / 2K / NCAA.

Per rookie: **nationality** by weighted draw (USA .34, England .08, Australia .06, S.Korea .06, Japan .05,
S.Africa .04, Spain .03, Sweden .03, Canada .03, Ireland .025, Germany .02, Argentina .02, France .02, Italy .015,
Denmark .015, rest .14); **name** = first+surname from that nation's banks (reroll on any collision with real or
generated names — banks must be large, 60+ each, or the world feels repetitive); **entry age** 18–22;
**potential** skewed so stars are rare (70% gauss(80,2.5), 20% gauss(85,1.5), 8% gauss(89,1.5), 2% gauss(92.5,1.5),
clamp 70–96) **with wide boom/bust tails of their own** so an invented nobody can occasionally become elite and a
hyped one can flame out; **archetype** weighted (all-rounder .30, bomber .18, ball-striker .18, putter .12,
short-game .12, scrambler .10) sets which skill ceilings elevate; **entry skills** = potential×arc(entry_age) so
they enter raw; mark `data_source='generated'`, `fictional=true`.

Players stuck below the pool cutoff for ~3 years lose their card (keeps the field fresh).

---

## 7. Each career = its own seeded universe

A new career gets a random `career_seed` driving EVERYTHING: the §2 potential rolls, retirement rolls, rookie
generation, and the season sim. A career is reproducible from its seed but every new career diverges. Persist
per-career state only; **discard it fully on reset**. No cross-career carryover — that's the point.

---

## 8. Build order

1. `arc()` + load-time `skill_potential`, then the per-career `roll_potential` from `pot_band` (§2–3).
2. Year advance: age → living ratings → retire (§4); your golfer's retirement ends the run.
3. Field seeding year 0 (§5) + rookie engine & large name banks (§6).
4. Per-career seeding, career-summary ceremony, reset-to-new-universe (§4, §7).
5. Wire living ratings into the season sim / calibrated field (living_overall, then course fit on top).

Keep arcade untouched (peak cards, no aging). The central feel dial is §2's boom/bust width — get it running,
then tune by playtest. Don't deploy without approval.

---

## Implementation status (bounded-career build, dev branch)

Done: pot_band per-career roll (rollPotential/applyCareerRoll, seeded); aging arcs + living ratings; real-player AND your-golfer retirement (entry age 22, decline from year 15 via DECLINE_RATE accelerating, pRetire roll + hard age-55, voluntary Retire button); field ages forward; generated rookies + expanded name banks; per-career seeded world discarded on reset; career-end ceremony (scrCareerEnd) -> Start a New Career (fresh 2026 universe). Leaderboard reworked for bounded careers: each season row carries career_id; Career board ranks each player BEST single career (supabase/22_runtour_leaderboard.sql, not yet applied). Decision: drafted 8 stay yours + re-spin upgrades (no grow-into-peak entry); bounded arc = year-15 decline + retirement. Tuning dials: DECLINE_START_YEAR=15, DECLINE_RATE, WORLD_TARGET=150.
