// ============================================================================
// _shared/packages.ts — RunTheTour purchasable packages (SERVER source of truth)
// ============================================================================
// The browser only ever sends a package_id. Coin/token amounts, prices and the
// pack KIND live here, on the server, so a tampered client can never inflate
// what it receives. The webhook branches on `kind` to fulfill:
//   coins  → runtour_credit_purchase  (adds paid_coins; first-purchase +100%)
//   tokens → runtour_credit_tokens    (adds extra Daily-Challenge attempts)
//   pass   → runtour_grant_pass       (grants the current 60-DAY SEASON's Tour Pass)
//
// Prices are created as Products/Prices in the Stripe Dashboard; paste each
// Price ID into the STRIPE_PRICE_* env vars (see functions/README.md). Do NOT
// hardcode live price IDs in the repo.
// ----------------------------------------------------------------------------

export type PackageKind = "coins" | "tokens" | "pass";

export interface CoinPackage {
  id: string;
  label: string;
  kind: PackageKind;
  priceCents: number; // for display/analytics only; Stripe is the billing source of truth
  priceEnv: string;   // env var holding this package's Stripe Price ID
  coins?: number;     // coins kind: base coins delivered (first-purchase bonus applied on top, server-side)
  tokens?: number;    // tokens kind: extra Daily-Challenge attempts granted
  passCoins?: number; // pass kind: coins credited on purchase (server-authoritative reward)
  passPacks?: number; // pass kind: seasonal packs the client grants for this pass period
}

export const PACKAGES: Record<string, CoinPackage> = {
  // ---- Coin buckets (Buy Coins) — owner-approved tiers ---------------------
  // ids + coins MUST match the client BUCKETS config in build-a-golfer.html.
  // `coins` is the base delivered; the +100% first-purchase bonus is applied on
  // top, SERVER-SIDE, in the webhook. Larger tiers also grant bonus packs
  // (handled client-side); the coin figures below are what the wallet receives.
  small: {
    id: "small",
    label: "Small Bucket",
    kind: "coins",
    coins: 15000,
    priceCents: 199,
    priceEnv: "STRIPE_PRICE_SMALL",
  },
  medium: {
    id: "medium",
    label: "Medium Bucket",
    kind: "coins",
    coins: 45000,
    priceCents: 499,
    priceEnv: "STRIPE_PRICE_MEDIUM",
  },
  large: {
    id: "large",
    label: "Large Bucket",
    kind: "coins",
    coins: 102000,
    priceCents: 999,
    priceEnv: "STRIPE_PRICE_LARGE",
  },
  xl: {
    id: "xl",
    label: "XL Bucket",
    kind: "coins",
    coins: 285000,
    priceCents: 1999,
    priceEnv: "STRIPE_PRICE_XL",
  },
  mega: {
    id: "mega",
    label: "Mega Bucket",
    kind: "coins",
    coins: 750000,
    priceCents: 4999,
    priceEnv: "STRIPE_PRICE_MEGA",
  },

  // ---- Daily-Challenge tokens (extra plays beyond the free 3/day) ----------
  tok1: {
    id: "tok1",
    label: "1 Daily Token",
    kind: "tokens",
    tokens: 1,
    priceCents: 199,
    priceEnv: "STRIPE_PRICE_TOK1",
  },
  tok3: {
    id: "tok3",
    label: "3 Daily Tokens",
    kind: "tokens",
    tokens: 3,
    priceCents: 299,
    priceEnv: "STRIPE_PRICE_TOK3",
  },
  tok7: {
    id: "tok7",
    label: "7 Daily Tokens",
    kind: "tokens",
    tokens: 7,
    priceCents: 499,
    priceEnv: "STRIPE_PRICE_TOK7",
  },
  tok15: {
    id: "tok15",
    label: "15 Daily Tokens",
    kind: "tokens",
    tokens: 15,
    priceCents: 999,
    priceEnv: "STRIPE_PRICE_TOK15",
  },

  // ---- Tour Pass — THE one and only pass: a one-time purchase per 60-DAY
  // SEASON (owner decision: the monthly pass is removed; everything is built
  // around the 60-day Tour Pass). Seasons are global and match the in-game
  // Tour Pass track (Season 1 began Jul 1 2026 ET; migration 72 computes the
  // season server-side). Buying grants THIS season only: the server credits
  // passCoins into paid_coins and records the season's entitlement
  // (tour_pass, period 'S<n>'); the client then unlocks the PRO lane of the
  // Tour Pass track, unlimited daily plays, a 1.5× reward multiplier, and
  // grants the 2 seasonal packs. When the season rolls over the entitlement
  // lapses and the new season's pass must be bought. create-checkout refuses
  // a second purchase in the same season (runtour_pass_status → 409).
  tourpass: {
    id: "tourpass",
    label: "Tour Pass (60-day season)",
    kind: "pass",
    passCoins: 30000, // coins credited on purchase
    passPacks: 2,     // seasonal packs granted client-side for this period
    priceCents: 1499,
    priceEnv: "STRIPE_PRICE_TOURPASS",
  },
};

// One-time first-purchase incentive: +100% coins on a player's first paid
// COIN pack (does not apply to tokens or the pass).
export const FIRST_PURCHASE_MULTIPLIER = 2;

export function getPackage(id: string | null | undefined): CoinPackage | null {
  if (!id) return null;
  return PACKAGES[id] ?? null;
}
