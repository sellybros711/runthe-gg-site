/* Run The Arcade Card — Stripe Customer Portal (Cloudflare Pages Function)
 *
 * POST /api/stripe/portal   body: { user_id, return_path? }
 *   → { url: "https://billing.stripe.com/..." }
 *
 * Lets an Arcade Card member manage/cancel their membership in Stripe's hosted
 * portal. Requires the Customer Portal to be enabled in the Stripe Dashboard
 * (Settings → Billing → Customer portal).
 *
 * Env: STRIPE_SECRET_KEY, SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE.
 *
 * SECURITY: the user is identified from the verified Supabase session token
 * (Authorization: Bearer <access_token>), NOT from the request body — a body
 * user_id would let anyone open another member's billing portal.
 */
import { verifyUser } from './_verify.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  // Wrap everything: an unhandled throw here surfaces to the browser as an
  // opaque 502 with no JSON body (impossible to diagnose). Convert any crash
  // into a readable JSON error instead.
  try {
    if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
      return json({ error: 'stripe_not_configured' }, 503);
    }
    let body = {};
    try { body = await request.json(); } catch (e) {}

    // Authenticated user only, derived from the session token — never the body.
    const userId = await verifyUser(env, request);
    if (!userId) return json({ error: 'unauthorized' }, 401);

    // find this user's Stripe customer, three ways, in order (see findCustomer)
    const customer = await findCustomer(env, userId);
    if (!customer) return json({ error: 'no_customer' }, 404);

    const site = env.SITE_URL || new URL(request.url).origin;
    /* WHERE TO COME BACK TO. An allow-list rather than a pattern, because this
     * value ends up in a redirect and an unchecked one is an open redirect.
     *
     * IT USED TO BE /arcade/ AND ONLY /arcade/, from when the Arcade Card was the
     * only thing anybody could buy. A bundle buyer opening their receipts from the
     * football game was then returned to a different game, which reads as being
     * logged out of the one they were in. The roots below are the games a bundle
     * can be bought from, which is _bundles.js's returnRoots plus the Arcade. */
    const ROOTS = ['/arcade/', '/football/', '/cfb/', '/golf/'];
    let ret = typeof body.return_path === 'string' ? body.return_path : '/arcade/';
    if (!ROOTS.some(function (root) { return ret.indexOf(root) === 0; })) ret = '/arcade/';

    const form = new URLSearchParams({ customer: customer, return_url: site + ret });
    let res, data;
    try {
      res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form
      });
      data = await res.json();
    } catch (e) {
      return json({ error: 'stripe_unreachable', detail: String(e && e.message || e) }, 502);
    }
    if (!res.ok) return json({ error: 'stripe_error', detail: data && data.error && data.error.message }, 502);
    if (!data || !data.url) return json({ error: 'stripe_error', detail: 'Stripe returned no portal URL.' }, 502);
    return json({ url: data.url });
  } catch (e) {
    return json({ error: 'exception', detail: String(e && e.message || e) }, 500);
  }
}

/* THE CUSTOMER, AND A BUNDLE BUYER IS NOT IN THE OBVIOUS PLACE.
 *
 * `subscriptions.stripe_customer_id` is written by subscription events, and a
 * premium bundle is a one-time payment that writes no subscriptions row at all
 * (supabase/101_premium_bundles.sql says why, and it is right to: a bundle year
 * of the Arcade Card must never clobber a real recurring one). So the reader that
 * only knew about that table answered 404 for every bundle buyer, and the account
 * screen offering them their own receipts was a button that could not work.
 *
 * Three sources, cheapest first:
 *
 *   1. the subscriptions row, for anybody who has ever had an Arcade Card
 *   2. premium_unlocks.payload -> stripe_customer, written by the webhook
 *   3. the checkout session itself, retrieved from Stripe
 *
 * Three exists because two is only true going forward: a bundle granted before
 * the webhook started recording the customer has the session id in its payload
 * and nothing else, and one API call turns that into the customer. It is the slow
 * path and it is never the first one tried.
 *
 * Returns a customer id or null. A failure to read any source is null, which the
 * caller reports as no_customer: there is nothing here worth failing loudly over,
 * because the answer either way is that this account has no billing to show.
 */
async function findCustomer(env, userId) {
  const sub = await pgFirst(env, 'subscriptions?user_id=eq.' + encodeURIComponent(userId) +
    '&select=stripe_customer_id&limit=1');
  if (sub && sub.stripe_customer_id) return sub.stripe_customer_id;

  const rows = await pgRows(env, 'premium_unlocks?user_id=eq.' + encodeURIComponent(userId) +
    '&select=payload&order=granted_at.desc');
  for (const row of rows) {
    const p = row && row.payload;
    if (p && typeof p.stripe_customer === 'string' && p.stripe_customer) return p.stripe_customer;
  }
  for (const row of rows) {
    const id = row && row.payload && row.payload.checkout_session;
    if (typeof id !== 'string' || !id) continue;
    try {
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(id), {
        headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY }
      });
      if (!r.ok) continue;
      const s = await r.json();
      // expand is not needed: an unexpanded session carries the customer as a string id
      const c = s && s.customer;
      if (typeof c === 'string' && c) return c;
      if (c && typeof c.id === 'string') return c.id;
    } catch (e) {}
  }
  return null;
}

async function pgRows(env, query) {
  try {
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + query, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE }
    });
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) { return []; }
}
async function pgFirst(env, query) {
  const rows = await pgRows(env, query);
  return rows[0] || null;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
