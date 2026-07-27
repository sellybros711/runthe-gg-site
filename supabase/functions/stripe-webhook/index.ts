// ============================================================================
// stripe-webhook — the ONLY path that credits real-money coins
// ============================================================================
// Fulfills on `checkout.session.completed` (never on the browser redirect),
// verifies the Stripe signature, maps package_id → coins on the SERVER, and
// credits via the security-definer RPC (idempotent on the Stripe event id).
// Handles refunds/disputes by clawing the coins back.
//
// Required env (supabase secrets set ...):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy with signature verification intact (public endpoint, no JWT):
//   supabase functions deploy stripe-webhook --no-verify-jwt
// ----------------------------------------------------------------------------

import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getPackage, FIRST_PURCHASE_MULTIPLIER } from "../_shared/packages.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// Service-role client → allowed to call the credit/refund RPCs. Never exposed
// to the browser.
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  const body = await req.text(); // raw body required for signature verification
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error("signature verification failed:", (err as Error).message);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") break; // ignore unpaid/async-pending

        const userId = session.metadata?.user_id ?? null;
        const packageId = session.metadata?.package_id ?? null;
        const pkg = getPackage(packageId);
        if (!userId || !pkg) {
          console.error("unfulfillable session", session.id, { userId, packageId });
          break; // 200 so Stripe stops retrying a session we can't map
        }

        // First-purchase +100% — decided by the SERVER, from prior purchases.
        let coins = pkg.coins;
        let pkgKey = pkg.id;
        const { count } = await admin
          .from("coin_purchase")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "paid");
        if ((count ?? 0) === 0) {
          coins = pkg.coins * FIRST_PURCHASE_MULTIPLIER;
          pkgKey = `${pkg.id}+fp`;
        }

        const { data, error } = await admin.rpc("runtour_credit_purchase", {
          p_user: userId,
          p_event: event.id,
          p_session: session.id,
          p_pi: (session.payment_intent as string) ?? null,
          p_package: pkgKey,
          p_coins: coins,
          p_amount_cents: session.amount_total ?? pkg.priceCents,
          p_currency: session.currency ?? "usd",
        });
        if (error) throw error;
        console.log(`credited ${coins} coins to ${userId} (${pkgKey}), balance=${data}`);
        break;
      }

      case "charge.refunded":
      case "charge.dispute.created": {
        const charge = event.data.object as Stripe.Charge | Stripe.Dispute;
        const pi = (charge as Stripe.Charge).payment_intent ??
          (charge as Stripe.Dispute).payment_intent;
        if (!pi) break;
        const status = event.type === "charge.dispute.created" ? "disputed" : "refunded";
        const { error } = await admin.rpc("runtour_refund_purchase", {
          p_ref: pi as string,
          p_status: status,
        });
        if (error) throw error;
        console.log(`clawback (${status}) for payment_intent ${pi}`);
        break;
      }

      default:
        break; // ignore everything else
    }
  } catch (err) {
    // Return 500 so Stripe retries; DB idempotency makes retries safe.
    console.error("handler error:", (err as Error).message);
    return new Response("handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
