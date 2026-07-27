// ============================================================================
// _shared/packages.ts — RunTheTour purchasable packages (SERVER source of truth)
// ============================================================================
// The browser only ever sends a package_id. Coin/token amounts, prices and the
// pack KIND live here, on the server, so a tampered client can never inflate
// what it receives. The webhook branches on `kind` to fulfill:
//   coins  → runtour_credit_purchase  (adds paid_coins; first-purchase +100%)
//   tokens → runtour_credit_tokens    (adds extra Daily-Challenge attempts)
//   pass   → runtour_grant_pass       (grants the current month's Tour Pass)
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
    label: "Small",
    kind: "coins",
    coins: 15000,
    priceCents: 199,
    priceEnv: "STRIPE_PRICE_SMALL",
  },
  medium: {
    id: "medium",
    label: "Medium",
    kind: "coins",
    coins: 42000,
    priceCents: 499,
    priceEnv: "STRIPE_PRICE_MEDIUM",
  },
  large: {
    id: "large",
    label: "Large",
    kind: "coins",
    coins: 95000,
    priceCents: 999,
    priceEnv: "STRIPE_PRICE_LARGE",
  },
  xl: {
    id: "xl",
    label: "XL",
    kind: "coins",
    coins: 210000,
    priceCents: 1999,
    priceEnv: "STRIPE_PRICE_XL",
  },
  mega: {
    id: "mega",
    label: "Mega",
    kind: "coins",
    coins: 575000,
    priceCents: 4999,
    priceEnv: "STRIPE_PRICE_MEGA",
  },

  // ---- Daily-Challenge tokens (extra plays beyond the free 3/day) ----------
  tok1: {
    id: "tok1",
    label: "1 Daily Token",
    kind: "tokens",
    tokens: 1,
    priceCents: 99,
    priceEnv: "STRIPE_PRICE_TOK1",
  },
  tok3: {
    id: "tok3",
    label: "3 Daily Tokens",
    kind: "tokens",
    tokens: 3,
    priceCents: 199,
    priceEnv: "STRIPE_PRICE_TOK3",
  },
  tok7: {
    id: "tok7",
    label: "7 Daily Tokens",
    kind: "tokens",
    tokens: 7,
    priceCents: 299,
    priceEnv: "STRIPE_PRICE_TOK7",
  },
  tok15: {
    id: "tok15",
    label: "15 Daily Tokens",
    kind: "tokens",
    tokens: 15,
    priceCents: 499,
    priceEnv: "STRIPE_PRICE_TOK15",
  },

  // ---- Tour Pass (one-time monthly purchase; grants the current month's pass)
  // A new themed pass runs each calendar month; buying grants THIS month only.
  // The server credits passCoins into paid_coins and records the month's
  // entitlement (tour_pass); the client grants the seasonal packs, unlocks
  // unlimited daily plays, and applies a reward multiplier while the pass is
  // active. When the month ends the entitlement lapses and a new pass must be
  // bought.
  tourpass: {
    id: "tourpass",
    label: "Tour Pass",
    kind: "pass",
    passCoins: 30000, // coins credited on purchase
    passPacks: 2,     // seasonal packs granted client-side for this period
    priceCents: 999,
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
