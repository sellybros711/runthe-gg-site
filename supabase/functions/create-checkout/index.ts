// ============================================================================
// create-checkout — start a hosted Stripe Checkout for a coin package
// ============================================================================
// The browser sends { package_id, return_path }. This function authenticates
// the caller from their Supabase JWT, looks up the package + Stripe Price on
// the SERVER, and stamps user_id + package_id into the session metadata so the
// webhook can fulfill it. The browser never sends prices or coin amounts.
//
// Required env:
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL,
//   STRIPE_PRICE_SMALL, STRIPE_PRICE_MEDIUM, STRIPE_PRICE_LARGE,
//   STRIPE_PRICE_XL, STRIPE_PRICE_MEGA, plus the token/pass price env vars
//   (see _shared/packages.ts for the full list)
//
// Deploy (JWT enforced so only signed-in players can buy):
//   supabase functions deploy create-checkout
// ----------------------------------------------------------------------------

import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getPackage } from "../_shared/packages.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://runthe.gg";
// (price, package) pairs already verified against Stripe this instance — see the checkout guard below.
const _priceVerified = new Set<string>();
// Stripe Tax needs the account's tax settings configured (origin address etc.) before live sessions
// with automatic_tax succeed. Launch-safe default: OFF until the owner sets the secret STRIPE_TAX=on.
const TAX_ON = (Deno.env.get("STRIPE_TAX") ?? "").toLowerCase() === "on";

// The live site, plus localhost / file:// pages so test-mode purchases can be
// exercised from a local copy of the client. Auth is the bearer JWT (never a
// cookie), so echoing a dev origin grants nothing a caller doesn't already hold.
const corsFor = (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const dev = origin === "null" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "access-control-allow-origin": dev ? origin : SITE_URL,
    // supabase-js sends apikey + x-client-info alongside the JWT; the browser
    // refuses to POST unless the preflight allows every header it plans to send.
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
  };
};
Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Identify the buyer from their JWT — purchases require an account.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ error: "sign in to buy coins" }, 401);

  let payload: { package_id?: string; return_path?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  const pkg = getPackage(payload.package_id);
  if (!pkg) return json({ error: "unknown package" }, 400);

  const priceId = Deno.env.get(pkg.priceEnv);
  if (!priceId) {
    console.error(`missing price env ${pkg.priceEnv} for package ${pkg.id}`);
    return json({ error: "package unavailable" }, 503);
  }

  // Guard against a miswired STRIPE_PRICE_* secret: the Stripe Price behind this package must be a
  // one-time USD price whose amount matches the package exactly, or a paste-slip in the dashboard
  // would charge players the wrong amount for what they're buying. Verified once per (price, package)
  // per instance; a mismatch refuses checkout and names the bad secret in the logs.
  const okKey = `${pkg.id}:${priceId}`;
  if (!_priceVerified.has(okKey)) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      const cents = price.unit_amount ?? -1;
      const cur = (price.currency ?? "usd").toLowerCase();
      if (price.recurring || cents !== pkg.priceCents || cur !== "usd") {
        console.error(
          `PRICE MISMATCH for package ${pkg.id}: secret ${pkg.priceEnv} -> ${priceId} is ` +
          `${cur} ${cents}${price.recurring ? " (recurring)" : ""}, expected usd ${pkg.priceCents}. ` +
          `Re-paste the correct Price ID into ${pkg.priceEnv}.`,
        );
        return json({ error: "package unavailable" }, 503);
      }
      _priceVerified.add(okKey);
    } catch (err) {
      console.error(`price lookup failed for ${pkg.id} (${pkg.priceEnv}=${priceId}):`, (err as Error).message);
      return json({ error: "package unavailable" }, 503);
    }
  }

  // Tour Pass double-purchase guard: one pass per 60-day season. The season is
  // computed by the DB (runtour_pass_status, migration 72) with the buyer's own
  // JWT, so a tampered client can't skip it. Fail OPEN on an RPC error (e.g. the
  // migration not applied yet) — the webhook/DB side still handles a duplicate
  // gracefully (coins credited, pass row conflict is a no-op).
  if (pkg.kind === "pass") {
    try {
      const { data, error } = await supabase.rpc("runtour_pass_status");
      const st = Array.isArray(data) ? data[0] : data;
      if (!error && st && st.pass_active) {
        return json(
          { error: "you already have this season's Tour Pass — it's active until the season ends" },
          409,
        );
      }
      if (error) console.error("pass-status check failed (proceeding):", error.message);
    } catch (e) {
      console.error("pass-status check failed (proceeding):", (e as Error).message);
    }
  }

  const returnPath = (payload.return_path ?? "/golf/").replace(/[^a-zA-Z0-9/_-]/g, "");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse a Stripe customer per user so refunds/receipts stay attributable.
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      metadata: { user_id: user.id, package_id: pkg.id },
      payment_intent_data: { metadata: { user_id: user.id, package_id: pkg.id } },
      success_url: `${SITE_URL}${returnPath}?purchase=success`,
      cancel_url: `${SITE_URL}${returnPath}?purchase=cancelled`,
      automatic_tax: { enabled: TAX_ON },
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("checkout create failed:", (err as Error).message);
    return json({ error: "could not start checkout" }, 500);
  }
});
