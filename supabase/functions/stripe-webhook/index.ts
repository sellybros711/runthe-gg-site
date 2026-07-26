// ============================================================================
// stripe-webhook  —  the ONLY thing that credits a wallet.
// ----------------------------------------------------------------------------
// Verifies the Stripe signature, then on a paid checkout looks up each line
// item's Price.lookup_key and calls the fulfill_stripe_purchase() RPC (service
// role), which grants coins/spins from stripe_catalog. Idempotent per
// (event id, line item), so Stripe retries can't double-credit.
//
// Deploy WITHOUT JWT verification (see config.toml: verify_jwt = false) — Stripe
// does not send a Supabase JWT. Security comes from the signature check below.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (+ injected SUPABASE_*).
// ============================================================================
import Stripe from "npm:stripe@^18.0.0";
import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});
// Deno's Web Crypto is async → use the async provider + constructEventAsync.
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  const body = await req.text(); // raw body is required for verification
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
    // We fulfill on checkout.session.completed for standard card flows, and on
    // async_payment_succeeded for delayed methods. Both carry the session.
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;

      // Guard: only grant once actually paid (skips unpaid/expired sessions).
      if (session.payment_status !== "paid") {
        return ok();
      }

      const userId =
        session.client_reference_id ??
        (session.metadata?.supabase_user_id as string | undefined) ??
        null;

      // Expand prices so we get each line item's lookup_key.
      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
        { limit: 100, expand: ["data.price"] },
      );

      for (let i = 0; i < lineItems.data.length; i++) {
        const li = lineItems.data[i];
        const price = li.price as Stripe.Price | null;
        const lookupKey = price?.lookup_key ?? null;
        if (!lookupKey) {
          console.warn(`line item ${i} has no lookup_key; skipping`);
          continue;
        }
        const { data, error } = await admin.rpc("fulfill_stripe_purchase", {
          p_idem_key: `${event.id}:${i}`,
          p_event_id: event.id,
          p_event_type: event.type,
          p_user_id: userId,
          p_lookup_key: lookupKey,
          p_quantity: li.quantity ?? 1,
        });
        if (error) {
          // Return 500 so Stripe retries the whole event; idempotency makes the
          // retry safe (already-granted line items no-op).
          console.error("fulfill rpc error:", error);
          return new Response("fulfillment error", { status: 500 });
        }
        console.log(`fulfilled ${lookupKey}:`, data);
      }
    }

    return ok();
  } catch (err) {
    console.error("webhook handler error:", err);
    return new Response("handler error", { status: 500 });
  }
});

function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
