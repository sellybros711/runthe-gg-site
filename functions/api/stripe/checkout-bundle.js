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
  try {
    return await handle(context);
  } catch (e) {
    // NEVER LET AN EXCEPTION ESCAPE AS A 5xx, and this is not tidiness. A 5xx
    // leaving a Pages Function reaches the browser as Cloudflare's own HTML
    // error page: the body we wrote is discarded, so the caller gets
    // "<!DOCTYPE html>" where the reason should be and every failure looks
    // identical. That is exactly how this endpoint's first real failure
    // presented, and the reason took a round of guessing that the message
    // itself would have answered.
    return json({ error: 'server_error', detail: (e && e.message) ? e.message : String(e) }, 400);
  }
}

async function handle(context) {
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

  let attempt = await createSession(env, form);

  /* A STORED CUSTOMER ID CAN BE UNUSABLE, AND THE SALE MUST NOT DIE WITH IT.
   *
   * `subscriptions.stripe_customer_id` is written by whichever Stripe mode was
   * live when that row was last touched, and this endpoint runs against
   * whatever STRIPE_SECRET_KEY says today. Those are not the same question. An
   * account whose row was recorded while the Arcade Card was being tested
   * carries a TEST customer, and a test customer against a live key is refused
   * outright: "No such customer: 'cus_...'; a similar object exists in test
   * mode, but a live mode key was used to make this request." The buyer did
   * nothing wrong, the price is fine, and checkout simply never opens.
   *
   * The same shape covers a customer deleted in the dashboard and a row left
   * behind by a different Stripe account. In every case the stored id is the
   * only bad part of an otherwise valid request, so drop it and let Stripe
   * make a fresh customer. Reuse is an optimisation against duplicate
   * customers; it is not worth failing a purchase over.
   *
   * Retried ONCE and only for this error, so a genuine Stripe outage still
   * surfaces as itself rather than as two identical failures. */
  if (!attempt.res.ok && customer && isMissingCustomer(attempt.data)) {
    form.delete('customer');
    form.set('customer_creation', 'always');
    if (body.email) form.set('customer_email', String(body.email));
    attempt = await createSession(env, form);
  }

  // 400 rather than 502 for the same reason as the catch above: Stripe's
  // message is the whole value of this branch, and a 5xx would replace it
  // with Cloudflare's error page. The `error` field is what callers switch on,
  // never the status.
  if (!attempt.res.ok) {
    return json({ error: 'stripe_error', detail: attempt.data.error && attempt.data.error.message }, 400);
  }
  return json({ url: attempt.data.url });
}

async function createSession(env, form) {
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  });
  // A non-JSON body from Stripe would otherwise throw here and lose the status
  // along with it, which is the failure the wrapper above exists to prevent.
  let data = {};
  try { data = await res.json(); } catch (e) {}
  return { res: res, data: data };
}

/* Stripe says this two ways depending on the endpoint, so match both: the
 * structured code plus the message, rather than trusting either alone. */
function isMissingCustomer(data) {
  const err = (data && data.error) || {};
  if (err.code === 'resource_missing' && err.param === 'customer') return true;
  return typeof err.message === 'string' && err.message.indexOf('No such customer') === 0;
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
