# Tour Pass — 60-day umbrella season pass (design v2)

Owner brief: "Umbrella season pass... build it and preview everything before deploying.
We can revamp our boost system and accessory catalog however we need to in order to make
this a long lasting, stable game economy."

## 1. Concept
A recurring **60-day season** with a tiered reward **Track**. Everyone climbs the SAME
track by earning **Pass XP** from every mode. Two lanes per tier:
- **FREE lane** — everyone. Coins, shards, occasional packs, a few free cosmetics.
- **PRO lane** — unlocked once per season with **coins** (earned currency, never real money).
  Better rewards + the season's exclusive cosmetics + a tier-50 capstone.

Ties the existing systems together (coins / packs / shards / cosmetics / Drops) instead of
adding a parallel economy. New currency = none. New XP accumulator = Pass XP (season-scoped).

## 2. Cadence (deterministic, global — like the Daily)
- `TOURPASS_EPOCH` = a fixed UTC start date. `TOURPASS_LEN = 60` days.
- `passSeason()` -> {n, day (1..60), daysLeft, endMs} from `Date.now()` (ET, matching the daily
  day boundary so seasons flip at ET midnight).
- Season number `n` is shown ("Season 3"). All players share the same season window.

## 3. Pass XP (unified faucet — from ALL modes)
Its OWN season-scoped accumulator in `bag_pass.xp` (resets each season). Does NOT touch
Tour Rep (lifetime prestige) or bag_xp (challenge rep) — separate ladders, no double-count.
Sources (tunable `PASS_XP` map):
- Daily / Beat the Pro completed (+more for beating the pro / margin)
- Career: per finished event (scaled by finish), win, major, season completed
- Online H2H: play + win
- Monthly Spotlight, Legend rounds
- Bold in-round decisions that pay off (reuse decisionPayoutCoins signal)
- Achievement unlocked (small)
Hook at the same sites that already `awardPlayCoins` / `addXp`.

## 4. Track — ~50 tiers
`passTierXp(t)` = a rising curve (early tiers cheap, later steep) so a season is a real grind
but reachable. Each tier defines `{free:{...}, pro:{...}}` rewards drawn from existing pools:
- coins (addBonusCoins)
- shards {rarity, n} (shard earn counters)
- packs {tier, n} (grantFreePack)
- cosmetics {cat, id} — unlock via coinState.owned (existing plumbing)
Tier 50 PRO = a **season-exclusive capstone** (a unique aura or card background), only that season.
Rewards are CLAIMED manually per tier (a claim button per lane per unlocked tier), grow-only.

## 5. PRO lane unlock
`PASS_PRO_PRICE` coins, one-time per season (`bag_pass.pro=true`). Buying it retro-unlocks the
PRO rewards on every tier already reached (claimable immediately). Pure coin sink — no real money.

## 6. Storage + sync
`bag_pass` (acctKey-scoped) = `{season:n, xp, pro:bool, claimed:{free:[tierIdx...], pro:[...]}}`.
On a new season detected (`bag_pass.season !== passSeason().n`): reset xp/tier/claimed/pro
(the previous season's rewards are locked out — FOMO/collectible loop). Added to `cloudBundle`
with `mergePass`: newer season wins; same season = max xp, OR pro, union claimed arrays.

## 7. UI — full-screen `tourpass` overlay (S.overlay='tourpass')
- Header: "TOUR PASS · Season N", a big XP bar (Tier X · N/需 XP to next), days-left countdown
  (reuse the dCd live ticker), and a "🔓 Unlock Pro Pass · {price} coins" CTA (or "PRO" badge if owned).
- Track: vertical scroll of tier rows. Each row = tier number + XP threshold, a FREE reward cell
  (left) + a PRO reward cell (right), with state: LOCKED (below your tier, dim) / CLAIMABLE
  (reached + unclaimed, glowing CLAIM) / CLAIMED (✓) / PRO-LOCKED (need to buy the Pro Pass).
  Reward cells reuse the item thumbnails (cosThumbHTML / pack art / coin+shard icons).
- Auto-scroll to the current tier on open.
Entry points: a **Tour Pass card** on the home screen (its own accent), a ≡-menu row, and it can
share the bottom-nav / a header pill. Reward-claim fires a small celebration + toast.

## 8. Boost + accessory-catalog revamp (stability)
Principle for a long-lasting economy: the Pass hands out mostly **cosmetics + currency**, with
boost items rare, small, and capped — so climbing the pass never creates power creep. Concretely
(pending the audit numbers): keep boost magnitudes modest, keep the accBoost cap, and make the
pass's exclusive rewards COSMETIC-first (auras / plates / card bgs / patterns), with only a
handful of low-boost gear. Any catalog rebalance will be proposed with exact before/after numbers
once the current values are mapped, and previewed before deploy.

## 9. Preview-before-deploy
Build fully, Playwright-render the overlay (locked/claimable/claimed/pro states) + the home card
+ a full XP-earn round, screenshot each, and show the owner. Deploy to /golf only on go-ahead.
