# Pack System — Design Plan (DRAFT, not built)

> Goal (owner): players buy a **pack** for much cheaper than an item's sticker price and
> get a **random shot at any item** except the achievement-unlockable ones. Make direct-buy
> prices **extremely expensive** so packs are the obvious value path. Do **not** launch until
> it's perfect — this doc is the plan to iterate on.

Status: **planning only.** Nothing in this doc is coded yet. The novelty items + Pro Shop
relaunch are live at /golf; packs are the next feature and ship behind a `PACKS_ENABLED` flag.

### ✅ Decisions locked (owner)
- **Q1 Dupes → small coin refund.** True-gacha style: every pull is a fresh rarity-weighted
  roll from the **whole** eligible pool (owned items included). A duplicate pays back a **small**
  amount of coins (well below the pack price, scaled by the dupe's rarity). No shards/crafting.
- **Q2 Pool → include boost items.** Packs can drop the **boost-carrying** accessory gear + Golf
  Bag club tiers too, not just cosmetics. (A random shot at power is intended.)
- **Q3 Price hike → same day as packs.** Keep today's prices live now; flip the big direct-buy
  hike **and** packs together on launch day.
- **Q4 Real-money coins → earned-only for now.** Coins stay play-earned, so a **lighter
  client-side v1** is fine (no mandatory server-authoritative opening yet). We still publish
  odds. If real-money coins are ever added later, revisit §6/§7 (server rolls + compliance).

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
| Boosted accessory gear (`ACCESSORIES`) | 32 | ✅ **included** (owner Q2) |
| Golf Bag club tiers | 18 | ✅ **included** (owner Q2 — but see note) |

**Packable pool ≈ 120 items** (cosmetics + boost gear + bag tiers), and it grows every time we
add novelty items — which is perfect: more items = more pulls to chase = packs stay fresh.

The **exclusion rule** is simple and already codeable: an item is pack-eligible iff it is a
shop item AND its price is > 0 AND it is not `earn:true`. Legend gear and anything the game
auto-grants for an achievement is never in the pool.

**Bag-tier wrinkle (Q2 side-effect):** bag clubs normally must be bought in order
(Tour → Pro → Signature). If a pack drops "Signature Driver" while you own neither lower tier,
we should either (a) auto-grant the lower tiers with it, or (b) pool only the **Tour (tier-1)**
club as the packable item and keep Pro/Signature on the direct-buy upgrade path. **Recommend (b)**
— cleaner, and keeps the club-upgrade grind meaningful. Boost *accessory* gear has no ordering,
so all 32 drop freely.

---

## 1b. Catalog goal — 200+ pullable items (long-term)

Owner target: an **extensive** pull list, **200+ items**, grown over time (this is a long-term
game). Current pool ≈120; we build toward 200+ in batches. Growth levers, cheapest → richest:

- **Patterns** (`PXPAT`, procedural `f(x,y)`) — nearly free to add, each visually distinct on the
  shirt. Easiest way to add dozens. Target ~50.
- **Colors** (shirt/hat/pants/shoes) — trivial (hex + name). Named/themed colorways keep them
  from feeling like filler. Target ~60 across categories.
- **Boosted accessory gear** (`ACCESSORIES`, icon-based) — cheap data entries, each a boost item.
  Target ~60.
- **Authored headwear/eyewear sprites** (pixel art) — the exciting shaped items; slower to make,
  highest chase value. Target ~40 combined.

Because a bigger catalog means dupes are rarer and the chase is longer, a big list is exactly
what makes packs feel good long-term. Rarity mix + refund values (below) get re-tuned as the
catalog grows so the top tier stays genuinely rare.

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

**Long-term economy (owner):** this is a game people play for a long time, so the pricing has to
support a long chase, not be exhausted in a week. With a 200+ catalog, the top tiers should take
a serious, sustained grind (or many packs) to complete — a whale shouldn't 100% it quickly, and a
casual should still get a satisfying trickle of new items. So pack price + coin earn rate get
tuned against the *full* catalog size and the post-hike prices, aiming for a months-long
completion curve for a dedicated player.

**Faucets — owner is wary of FREE daily packs** (hands out too many accessories, cheapens them).
So lean AWAY from a recurring free pack. Instead earn coins → buy packs, with sparing one-offs
only: a **first-pack-free** onboarding, and occasional **milestone pack coins** (a major win, a
career completed) rather than a daily giveaway. The default path is *play → earn coins → choose
to open a pack*, which keeps items feeling earned. (Revisit only if engagement data says people
aren't opening enough.)

---

## 4. Duplicate handling — LOCKED: small coin refund

Every pull is a fresh rarity-weighted roll from the **whole** eligible pool (owned items
included — true gacha). If the roll is something you already own, it pays back a **small** coin
refund scaled by the dupe's rarity, e.g. Common ~1,500 · Rare ~3,500 · Epic ~8,000 ·
Legendary ~18,000 (all well under the ~20k pack price, so a dupe still stings but isn't a total
loss). No shards, no crafting. The reveal should clearly flag a dupe ("Duplicate — +N coins")
vs. a genuinely new unlock ("NEW!"). Tunable refund table per rarity.

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

## 8b. Build status (behind `PACKS_ENABLED=false` — nothing live)

- ✅ **P1 pool + rarity + price-hike scaffolding** — `packPool()` enumerates **195** eligible items
  (cosmetics + boost gear + bag tier-1, minus earned Legend gear + free items), rarity-banded
  (common 105 / rare 62 / epic 18 / legendary 10). `priceHike()` (x5) wired into cosmetic/acc/bag
  prices but follows the REAL flag, so **live prices are unchanged today** (verified 4000 stays 4000).
- ✅ **P2 roll engine + pity + dupe** — `openPack()`: pays coins, pity-aware rarity
  (guaranteed epic every 10, legendary every 40 — both verified), grants or refunds a dupe.
  All client-side; `bag_packs` holds the pity counters.
- ✅ **P3 Packs tab + buy flow + reveal** — a "Packs" tab in the Pro Shop, the pack card + pity
  line + "View drop rates", and a full-screen **reveal** (suspense spin with the rarity glow
  building, then the item worn on the golfer + NEW!/dupe, Equip / Open another / Done; confetti +
  chime on epic/legendary, reduced-motion safe). Test-only override `window._PACKSTEST` for QA.
- ⬜ **P4 faucets + odds screen polish** — first-pack-free, milestone pack coins, a proper drop-rate
  panel; final pack-price + earn-rate tuning vs the full catalog.
- ⬜ **P5 cross-device pity + (optional) server open** + Privacy/Terms update.
- ⬜ **P6 flip `PACKS_ENABLED`** once the reveal + economy feel perfect.

To QA the reveal live: set `window._PACKSTEST=true` in the console, open the Pro Shop → Packs.

## 8. Build phases (once the decisions below are locked)

1. **P1 — pricing + pool:** central `packEligible()` + rarity mapping; price-hike constants
   behind the shared flag (ships with packs, not before).
2. **P2 — roll engine + pity + dupe rule** (Option A or B), all client-side, unit-tested.
3. **P3 — Packs tab + buy flow + the reveal animation** (the "perfect" bar).
4. **P4 — coin faucets** (free daily pack, first-pack-free, milestone pack coins) + odds screen.
5. **P5 — (optional) server-authoritative open** + Privacy/Terms updates.
6. **P6 — QA:** Playwright reveal + pity + dupe + cloud-sync tests, then flip `PACKS_ENABLED`.

---

## 9. Decisions — RESOLVED

- **Q1 Dupes:** small coin refund (§4). ✅
- **Q2 Pool:** include boost gear + bag tiers (§1). ✅
- **Q3 Prices:** hike ships with packs, same day (§3). ✅
- **Q4 Real-money coins:** earned-only for now → lighter client-side v1 (§6). ✅
- **Q5 Pack cost + faucets:** owner wary of free daily packs → lean on earned coins, with only a
  first-pack-free + occasional milestone pack coins (§3). Exact pack price + earn rate tuned in P4
  against the FULL 200+ catalog for a months-long completion curve. ✅ (direction set)

## 10. The reveal experience (owner: "satisfying, exciting, suspenseful")

This is the heart of the feature and the "don't launch until perfect" bar. Target beats:
- **Anticipation:** the pack sits closed, a tap starts it — a shake/glow build, a rising tone.
- **Suspense:** a slot-reel or card-flip that *slows* as it lands; the **rarity color of the glow
  builds before the item is revealed** (you see "this is going to be big" a beat early). Longer
  hold for Epic/Legendary.
- **Payoff:** the item snaps in **worn on your pixel golfer**, rarity burst (confetti + chime on
  Legendary, reusing the win-celebration + `sfx` toolkit), a big **NEW!** stamp (or "Duplicate
  +N coins"), then **Equip** / **Open another**.
- Reduced-motion path: same information, no big animation. Haptics on reveal (Android).
- Multi-open: reveal one-by-one with a "skip" that fast-reveals the rest.
