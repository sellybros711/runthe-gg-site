/* Run The Arcade Card — Stripe Checkout (Cloudflare Pages Function)
 *
 * POST /api/stripe/checkout
 *   body: { user_id: "<supabase auth uid>", plan: "monthly"|"annual", email?, return_path? }
 *   → { url: "https://checkout.stripe.com/..." }
 *
 * Required Pages env vars (Settings → Environment variables):
 *   STRIPE_SECRET_KEY              sk_live_... / sk_test_...
 *   STRIPE_PRICE_ARCADE_MONTHLY    price_...   (Arcade Card, $5.99/mo)
 *   STRIPE_PRICE_ARCADE_ANNUAL     price_...   (Arcade Card, $49.99/yr)
 *   SITE_URL                       https://runthe.gg   (redirect base)
 * Optional (for customer reuse, dedupes Stripe customers):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE
 *
 * The Supabase user id rides in as client_reference_id + metadata so the webhook
 * grants the Arcade Card entitlement with no extra lookup. No free trial — the
 * generous free tier (guest 1/day, free account 3/day) is the try-before-you-buy.
 * Stripe Tax is enabled so consumer pricing reads "+ applicable tax".
 */
export async function onRequestPost(context) {
  const { env, request } = context;

  // plan → price (allow-list; the client can never inject an arbitrary price id)
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const plan = body.plan === 'annual' ? 'annual' : 'monthly';
  const price = plan === 'annual' ? env.STRIPE_PRICE_ARCADE_ANNUAL : env.STRIPE_PRICE_ARCADE_MONTHLY;
  if (!env.STRIPE_SECRET_KEY || !price) return json({ error: 'stripe_not_configured' }, 503);

  const userId = (body.user_id || '').trim();
  if (!userId) return json({ error: 'missing_user_id' }, 400);

  // Never sell a second card to an existing member (mirrors the golf Tour Pass).
  // This is the authoritative guard — the client hides the buy button too, but a
  // stale client or direct POST still can't create a duplicate subscription.
  const sub = await lookupSub(env, userId);
  if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
    return json({ error: 'already_active' }, 409);
  }

  const site = env.SITE_URL || new URL(request.url).origin;
  // return the player to where they were (defends against open-redirect: must be a local /arcade path)
  let ret = typeof body.return_path === 'string' ? body.return_path : '/arcade/';
  if (!/^\/arcade\//.test(ret)) ret = '/arcade/';
  const sep = ret.indexOf('?') >= 0 ? '&' : '?';

  const form = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    client_reference_id: userId,
    'metadata[supabase_user_id]': userId,
    'metadata[plan]': plan,
    'subscription_data[metadata][supabase_user_id]': userId,
    'automatic_tax[enabled]': 'true',
    success_url: site + ret + sep + 'checkout=success',
    cancel_url: site + ret + sep + 'checkout=cancelled',
    allow_promotion_codes: 'true'
  });

  // Reuse the customer we already recorded for this user (no duplicates). If we
  // can't look one up, fall back to prefilling the email and letting Stripe match.
  const customer = sub && sub.stripe_customer_id;
  if (customer) {
    form.set('customer', customer);
    form.set('customer_update[address]', 'auto');   // let Checkout collect/refresh address for tax
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

// Best-effort: read this user's subscription row (status + Stripe customer id).
async function lookupSub(env, userId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return null;
  try {
    const r = await fetch(
      env.SUPABASE_URL + '/rest/v1/subscriptions?user_id=eq.' + encodeURIComponent(userId) + '&select=status,stripe_customer_id&limit=1',
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return (rows && rows[0]) || null;
  } catch (e) { return null; }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
