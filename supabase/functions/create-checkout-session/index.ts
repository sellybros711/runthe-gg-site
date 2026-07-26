// ============================================================================
// create-checkout-session  —  starts a Stripe Checkout for a coin pack / spins.
// ----------------------------------------------------------------------------
// Flow:
//   1. Authenticate the caller from their Supabase JWT (Authorization: Bearer …).
//   2. Validate the requested `sku` (a Stripe Price lookup_key) against
//      stripe_catalog — the client can only buy things we actually sell.
//   3. Ensure the user has a Stripe Customer (create + persist on first buy).
//   4. Resolve the current active Price for that lookup_key and create a
//      one-time (mode=payment) Checkout Session, tagged with the user id.
//   5. Return { url } for the browser to redirect to.
//
// The wallet is NOT credited here — only the webhook grants, after Stripe
// confirms payment. See stripe-webhook.
//
// Env (Stripe secrets you set; SUPABASE_* are injected by the platform):
//   STRIPE_SECRET_KEY, SITE_URL (optional, default https://runthe.gg)
// ============================================================================
import Stripe from "npm:stripe@^18.0.0";
import { createClient } from "npm:@supabase/supabase-js@^2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  // apiVersion omitted → uses the account's default pinned version.
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://runthe.gg";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405, cors);
  }

  try {
    // ---- 1. authenticate the user from their JWT --------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "not signed in" }, 401, cors);

    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "not signed in" }, 401, cors);
    }
    const user = userData.user;

    // ---- 2. validate the requested SKU against our catalog ----------------
    const body = await req.json().catch(() => ({}));
    const sku = String(body?.sku ?? "").trim();
    if (!sku) return json({ error: "missing sku" }, 400, cors);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: item } = await admin
      .from("stripe_catalog")
      .select("lookup_key, title")
      .eq("lookup_key", sku)
      .eq("active", true)
      .maybeSingle();
    if (!item) return json({ error: "unknown sku" }, 400, cors);

    // ---- 3. ensure a Stripe Customer for this user ------------------------
    let customerId: string | null = null;
    const { data: existing } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing?.stripe_customer_id) {
      customerId = existing.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Upsert guards against a race where two tabs create in parallel.
      await admin.from("stripe_customers").upsert(
        { user_id: user.id, stripe_customer_id: customerId },
        { onConflict: "user_id" },
      );
    }

    // ---- 4. resolve the active Price for this lookup_key ------------------
    const prices = await stripe.prices.list({
      lookup_keys: [sku],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    if (!price) {
      return json(
        { error: `no active Stripe price for '${sku}' — run create_products.py` },
        400,
        cors,
      );
    }

    // ---- 5. create the Checkout Session ----------------------------------
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId!,
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id, sku },
      payment_intent_data: { metadata: { supabase_user_id: user.id, sku } },
      success_url: `${SITE_URL}/?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?purchase=cancel`,
      allow_promotion_codes: true,
    });

    return json({ url: session.url }, 200, cors);
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return json({ error: "internal error" }, 500, cors);
  }
});

function json(payload: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
