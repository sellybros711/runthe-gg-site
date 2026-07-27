// ============================================================================
// _shared/packages.ts — RunTheTour coin packages (SERVER source of truth)
// ============================================================================
// The browser only ever sends a package_id. Coin amounts and prices live here,
// on the server, so a tampered client can never inflate what it receives.
//
// Ladder = "Revenue-Focused (still fair)" from the economy audit. Prices are
// created as Products/Prices in the Stripe Dashboard; paste each Price ID into
// the STRIPE_PRICE_* env vars (see functions/README.md). Do NOT hardcode live
// price IDs in the repo.
// ----------------------------------------------------------------------------

export interface CoinPackage {
  id: string;
  label: string;
  coins: number;      // base coins delivered (first-purchase bonus is applied on top, server-side)
  priceCents: number; // for display/analytics only; Stripe is the billing source of truth
  priceEnv: string;   // env var holding this package's Stripe Price ID
}

export const PACKAGES: Record<string, CoinPackage> = {
  warmup: {
    id: "warmup",
    label: "Driving Range",
    coins: 15000,
    priceCents: 199,
    priceEnv: "STRIPE_PRICE_WARMUP",
  },
  clubhouse: {
    id: "clubhouse",
    label: "Clubhouse",
    coins: 45000, // 42,000 + 3,000 bonus, baked into the delivered amount
    priceCents: 499,
    priceEnv: "STRIPE_PRICE_CLUBHOUSE",
  },
  tour: {
    id: "tour",
    label: "Tour",
    coins: 102000, // 90,000 + 12,000 bonus
    priceCents: 999,
    priceEnv: "STRIPE_PRICE_TOUR",
  },
  championship: {
    id: "championship",
    label: "Championship",
    coins: 285000, // 240,000 + 45,000 bonus
    priceCents: 2499,
    priceEnv: "STRIPE_PRICE_CHAMPIONSHIP",
  },
};

// One-time first-purchase incentive: +100% coins on a player's first paid pack.
export const FIRST_PURCHASE_MULTIPLIER = 2;

export function getPackage(id: string | null | undefined): CoinPackage | null {
  if (!id) return null;
  return PACKAGES[id] ?? null;
}
