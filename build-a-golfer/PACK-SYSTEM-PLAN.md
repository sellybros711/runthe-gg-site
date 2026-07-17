# Pack System — Design Plan (DRAFT, not built)

> Goal (owner): players buy a **pack** for much cheaper than an item's sticker price and
> get a **random shot at any item** except the achievement-unlockable ones. Make direct-buy
> prices **extremely expensive** so packs are the obvious value path. Do **not** launch until
> it's perfect — this doc is the plan to iterate on.

Status: **planning only.** Nothing in this doc is coded yet. The novelty items + Pro Shop
relaunch are live at /golf; packs are the next feature and ship behind a `PACKS_ENABLED` flag.

---

## 1. The catalog we're pulling from

Everything is already a coin-purchased cosmetic keyed in `coinState.owned` (cloud-synced), so
a pack just needs to *grant an owned key*. Current counts:

| Category | Count | In pack pool? |
|---|---|---|
| Shirt colors (`sh:`) | 12 basic/fun + 7 lore | ✅ (minus the 6 free basics you already have) |
| Hat colors (`ht:`) | same 12 list | ✅ (minus 6 free) |
| Patterns (`sp:`) | 17 | ✅ |
| Trousers (`pt:`) | 8 | ✅ |
| Shoes (`so:`) | 6 | ✅ |
| Headwear (`hw:`) | ~9 (bucket/flat + 7 novelty) | ✅ |
| Eyewear (`ew:`) | 5 | ✅ |
| **Legend gear** (`earn:true`) | 5–7 | ❌ **excluded** (earned, never dropped) |
| Boosted accessory gear (`ACCESSORIES`) | 32 | ❔ decision (see Q2) |
| Golf Bag club tiers | 18 | ❔ decision (see Q2) |

**Packable cosmetic pool ≈ 70 items** today, and it grows every time we add novelty items —
which is perfect: more items = more pulls to chase = packs stay fresh.

The **exclusion rule** is simple and already codeable: an item is pack-eligible iff it is a
shop item AND `cosmeticPrice()` is > 0 AND it is not `earn:true`. Legend gear and anything the
game auto-grants for an achievement is never in the pool.

---

## 2. Rarity tiers + odds (the core of the gamble)

Bucket every pool item into a rarity from its **direct price band** (we set these), and give
each rarity a pull rate. Illustrative (tune later):

| Rarity | Example items | Direct price (post-hike) | Pull rate |
|---|---|---|---|
| Common | basic pattern, extra pants/shoe color | 40,000 | 55% |
| Rare | fun colors, mid patterns | 90,000 | 30% |
| Epic | novelty hats (cowboy/party/top hat), eyewear | 200,000 | 12% |
| Legendary | Champion Crown, Wizard Hat, flashiest patterns | 400,000 | 3% |

**Pity / bad-luck protection** (essential for feel): a guaranteed **Epic+ every 10 packs** and
a **Legendary every ~40**, tracked as counters on the account. Nothing feels worse than 30
commons in a row.

**Odds must be published in-app** (a "View drop rates" link on the pack screen). This is both a
player-trust thing and a legal requirement in several regions / app stores (see §7).

---

## 3. Pricing — the incentive to open packs

Two levers, moved together:

1. **Direct-buy prices go way up** (~4–8× today). A novelty hat 14k → ~120k; a Legendary
   → ~400k. Direct buy becomes the "I want *exactly this one*, right now" premium.
2. **A pack is cheap relative to the pool** — e.g. **~20,000 coins** for a shot at items worth
   40k–400k. Expected value of a pack lands *below* a Legendary but *above* a Common, so:
   - grinding coins to buy a specific Legendary outright feels brutal → you open packs instead,
   - but if you *must* have one item, the expensive direct-buy is still there as a targeted sink.

**Important sequencing note:** the price hike and the pack launch **must ship together.** If we
raise prices now (before packs are perfect), players have no cheap path and the shop feels
punishing. So: keep today's prices live, and flip *both* on pack launch day. (Flagged as Q3.)

Rough coin-economy sanity: a strong career earns ~20–35k spendable coins today (post 40%-grind
reset). At ~20k/pack that's ~1 pack/career — probably too slow. We'll likely want to **add coin
faucets** alongside packs (a free daily pack, a first-pack-free onboarding, pack coins from
milestones) so opening feels regular. This is the part most worth tuning before launch.

---

## 4. Duplicate handling (Q1 — biggest UX decision)

When a pack rolls something you already own:

- **Option A — "no dupes" (collection-friendly):** pack only ever pulls from your *unowned*
  eligible pool (still rarity-weighted within it). Every pack is a guaranteed new item until
  you've collected everything; after that, dupes convert to coins. *Pro:* zero frustration,
  clear progress. *Con:* less of a "gamble" once you're near-complete; a whale can 100% the
  collection.
- **Option B — "true gacha" (dupes → shards):** every pull is a fresh weighted roll from the
  whole pool; a dupe converts into **shards** (a soft currency) that you can spend to
  **directly craft any item you want** at a fixed shard cost per rarity. *Pro:* classic,
  long-tail, targeted crafting is satisfying; *Con:* more moving parts, can feel bad early.

**Recommendation: Option A to launch** (simplest, kindest, matches a finite cosmetic catalog),
with the shard/craft layer as a fast-follow once the catalog is big enough that dupes are common.

---

## 5. The open experience (where "perfect" lives)

This is the feature, so it has to *feel* great:

- A **Packs** tab in the Pro Shop (and a prominent home-screen "Open a Pack" moment when you
  have one).
- Buy → a **reveal animation**: a card / the pixel-golfer wearing the item slides or flips in,
  with a **rarity build-up** (color pulse, held beat for Epic/Legendary, confetti + a chime on
  Legendary — reusing the existing celebration + `sfx`/`slotSpin` toolkit). Reduced-motion safe.
- **"NEW!" badge**, the item previewed **on your golfer**, an **Equip now** button, and (Option
  A) a "N of M collected" progress line.
- **Multi-open** (open 5 at once) once single-open feels right.

## 6. Data model + integrity

- New account state: `packs` counter/inventory + `pity` counters + (Option B) `shards`, all in
  the existing **cloud-save bundle** (grow-only merges), so it syncs across devices with **no
  new SQL** for a v1.
- Purchases already deduct `coinState.spent` client-side; a pack does the same + writes the
  rolled `owned` key. **Trust model:** the whole coin economy is already client-authoritative
  (a cheater can hand-edit localStorage to grant any item today), so packs add **no new exploit
  surface** — but the randomness means a determined cheater could re-roll for a target.
- **For a truly "perfect" launch** we can move pack-opening **server-side** (a `runtour_open_pack`
  RPC that rolls server-side, records the grant, enforces the coin cost and pity) — this is the
  right hardening *if/when* coins ever have real value (real-money purchase). Until then it's
  optional. (Q4.)

## 7. Legal / policy (must-address before launch)

- **Loot-box rules:** packs bought with **earned-only** in-game coins are low-risk, but the
  moment coins become **purchasable with real money**, packs are a regulated loot box:
  Belgium/Netherlands restrict them, and Google Play / App Store + several US/EU regions
  **require published drop-rate odds**. So: publish odds regardless (§2), and treat "can you buy
  coins with money?" as a gating legal decision (Q3/Q4).
- Update the Privacy/Terms + the not-affiliated disclaimer to mention randomized packs + odds.
- Keep it away from anything that reads as gambling toward minors (we already have a 13+ age gate).

---

## 8. Build phases (once the decisions below are locked)

1. **P1 — pricing + pool:** central `packEligible()` + rarity mapping; price-hike constants
   behind the shared flag (ships with packs, not before).
2. **P2 — roll engine + pity + dupe rule** (Option A or B), all client-side, unit-tested.
3. **P3 — Packs tab + buy flow + the reveal animation** (the "perfect" bar).
4. **P4 — coin faucets** (free daily pack, first-pack-free, milestone pack coins) + odds screen.
5. **P5 — (optional) server-authoritative open** + Privacy/Terms updates.
6. **P6 — QA:** Playwright reveal + pity + dupe + cloud-sync tests, then flip `PACKS_ENABLED`.

---

## 9. Open decisions for the owner (blocking the build)

- **Q1 — Dupes:** Option A (no-dupes, collection-friendly) *[recommended]* or Option B
  (true gacha + shards/crafting)?
- **Q2 — Pool scope:** cosmetics only *[recommended]*, or also drop the **boost-carrying** items
  (accessory gear + bag clubs)? Dropping boost items = a random path to gameplay power (fine, or
  keep power on the direct-buy grind?).
- **Q3 — When to raise prices:** ship the big price hike **together with packs** *[recommended]*,
  or raise prices sooner?
- **Q4 — Real-money coins ever?** If yes → server-authoritative opening + full loot-box compliance
  become required before launch. If no (earned coins only) → lighter, faster to ship.
- **Q5 — Pack cost + coin faucets:** target ~1 pack per few careers, or a free daily pack so
  everyone opens regularly? (Drives how generous the faucets are.)
