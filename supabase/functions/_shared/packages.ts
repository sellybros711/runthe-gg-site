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
  // ---- Coin buckets (Buy Coins) --------------------------------------------
  warmup: {
    id: "warmup",
    label: "Driving Range",
    kind: "coins",
    coins: 15000,
    priceCents: 199,
    priceEnv: "STRIPE_PRICE_WARMUP",
  },
  clubhouse: {
    id: "clubhouse",
    label: "Clubhouse",
    kind: "coins",
    coins: 45000, // 42,000 + 3,000 bonus, baked into the delivered amount
    priceCents: 499,
    priceEnv: "STRIPE_PRICE_CLUBHOUSE",
  },
  tour: {
    id: "tour",
    label: "Tour",
    kind: "coins",
    coins: 102000, // 90,000 + 12,000 bonus
    priceCents: 999,
    priceEnv: "STRIPE_PRICE_TOUR",
  },
  championship: {
    id: "championship",
    label: "Championship",
    kind: "coins",
    coins: 285000, // 240,000 + 45,000 bonus
    priceCents: 2499,
    priceEnv: "STRIPE_PRICE_CHAMPIONSHIP",
  },
  biggest: {
    id: "biggest",
    label: "Biggest Bucket",
    kind: "coins",
    coins: 625000, // ~42 careers; ~+66% value over the base $1.99=15,000 rate
    priceCents: 4999,
    priceEnv: "STRIPE_PRICE_BIGGEST",
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
    passCoins: 30000, // ~2 careers of coins credited on purchase
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
