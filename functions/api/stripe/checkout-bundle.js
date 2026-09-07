/* Premium bundles (one-time) : Stripe Checkout (Cloudflare Pages Function)
 *
 * POST /api/stripe/checkout-bundle
 *   body: { bundle: "perfect-season"|"run-the-bundle", email?, return_path? }
 *   -> { url: "https://checkout.stripe.com/..." }
 *
 * Required Pages env vars (Settings -> Environment variables):
 *   STRIPE_SECRET_KEY                 sk_live_... / sk_test_...
 *   STRIPE_PRICE_PS_PREMIUM_BUNDLE    price_...  (Perfect Season Premium Bundle, one-time)
 *   STRIPE_PRICE_RUN_THE_BUNDLE       price_...  (Run The Bundle, one-time)
 *   SITE_URL                          https://runthe.gg
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE
 *
 * NOT LIVE UNTIL THE ENV VARS SAY SO. With either price var unset this endpoint
 * answers 503 stripe_not_configured for that bundle, which is the same posture
 * the Arcade checkout takes and the reason this file can ship ahead of any
 * launch decision.
 *
 * mode is 'payment', not 'subscription': a bundle is bought once. The webhook
 * grants it from checkout.session.completed (payment_status paid) or
 * checkout.session.async_payment_succeeded, keyed by metadata.bundle.
 *
 * ONE BUNDLE PER ACCOUNT, enforced here the way create-checkout refuses a
 * second Tour Pass: if the buyer already holds ANY of the bundle's products we
 * answer 409 instead of selling it again. Selling anyway would be worse than it
 * sounds: grants upsert on (user_id, product), so a second purchase would merge
 * into the first and the coins in a second Run The Bundle would simply never
 * arrive. A perfect-season owner asking for run-the-bundle hits this guard too;
 * an upgrade path (a promotion code, or a dedicated upgrade price) is an open
 * decision in the README, not something this endpoint invents.
 *
 * SECURITY: the buyer is identified from the verified Supabase session token
 * (Authorization: Bearer <access_token>), NOT the request body, for the reason
 * _verify.js explains.
 */
import { verifyUser } from './_verify.js';
import { bundleByKey } from './_bundles.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  // bundle -> price (allow-list; the client can never inject an arbitrary price id)
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const key = String(body.bundle || '');
  const bundle = bundleByKey(key);
  if (!bundle) return json({ error: 'unknown_bundle' }, 400);
  const price = env[bundle.envPrice];
  if (!env.STRIPE_SECRET_KEY || !price) return json({ error: 'stripe_not_configured' }, 503);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ error: 'stripe_not_configured' }, 503);

  // Authenticated user only, derived from the session token, never the body.
  const userId = await verifyUser(env, request);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  // One bundle per account (see the header). The client hides the buy button
  // for owners too, but a stale client or direct POST still can't double-sell.
  const owned = await lookupUnlocks(env, userId);
  if (owned === null) return json({ error: 'stripe_not_configured' }, 503);
  const clash = bundle.grants.some(function (g) { return owned.indexOf(g.product) >= 0; });
  if (clash) return json({ error: 'already_owned' }, 409);

  const site = env.SITE_URL || new URL(request.url).origin;
  // return the player to where they were (defends against open-redirect: the
  // path must live under one of this bundle's own games)
  let ret = typeof body.return_path === 'string' ? body.return_path : bundle.defaultReturn;
  const local = bundle.returnRoots.some(function (root) { return ret.indexOf(root) === 0; });
  if (!local) ret = bundle.defaultReturn;
  const sep = ret.indexOf('?') >= 0 ? '&' : '?';

  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    client_reference_id: userId,
    'metadata[supabase_user_id]': userId,
    'metadata[bundle]': key,
    // payment mode creates no Customer by default; always making one gives the
    // buyer receipts and lets a later Arcade subscription reuse it.
    customer_creation: 'always',
    success_url: site + ret + sep + 'checkout=success',
    cancel_url: site + ret + sep + 'checkout=cancelled',
    allow_promotion_codes: 'true'
  });

  // Reuse the customer we already recorded for this user (no duplicates). If we
  // can't look one up, fall back to prefilling the email and letting Stripe match.
  const customer = await lookupCustomer(env, userId);
  if (customer) {
    form.set('customer', customer);
    form.delete('customer_creation');   // Stripe rejects the pair together
  } else if (body.email) {
    form.set('customer_email', String(body.email));
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  });
  const data = await res.json();
  if (!res.ok) return json({ error: 'stripe_error', detail: data.error && data.error.message }, 502);
  return json({ url: data.url });
}

/* This user's existing unlock products. Returns an array, or null when the read
 * itself failed: those are different answers, and treating "couldn't check" as
 * "owns nothing" would let a flaky moment sell a second bundle whose coins then
 * vanish into the upsert. Fail closed with a retryable 503 instead. */
async function lookupUnlocks(env, userId) {
  try {
    const r = await fetch(
      env.SUPABASE_URL + '/rest/v1/premium_unlocks?user_id=eq.' + encodeURIComponent(userId) + '&select=product',
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return (rows || []).map(function (row) { return row.product; });
  } catch (e) { return null; }
}

// Best-effort: the Stripe customer the Arcade flow may already have recorded.
async function lookupCustomer(env, userId) {
  try {
    const r = await fetch(
      env.SUPABASE_URL + '/rest/v1/subscriptions?user_id=eq.' + encodeURIComponent(userId) + '&select=stripe_customer_id&limit=1',
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return (rows && rows[0] && rows[0].stripe_customer_id) || null;
  } catch (e) { return null; }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
