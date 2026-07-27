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

const CORS = {
  "access-control-allow-origin": SITE_URL,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
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
      automatic_tax: { enabled: true },
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("checkout create failed:", (err as Error).message);
    return json({ error: "could not start checkout" }, 500);
  }
});
