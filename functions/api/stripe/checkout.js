/* Run The Arcade Pro — Stripe Checkout (Cloudflare Pages Function)
 *
 * POST /api/stripe/checkout   body: { user_id: "<supabase auth uid>", email?: string }
 * → { url: "https://checkout.stripe.com/..." }
 *
 * Required Pages env vars (Settings → Environment variables):
 *   STRIPE_SECRET_KEY   sk_live_... / sk_test_...
 *   STRIPE_PRICE_ID     price_...   (the Pro subscription price)
 *   SITE_URL            https://runthe.gg   (redirect base)
 *
 * The Supabase user id rides in as client_reference_id + metadata so the
 * webhook can grant the entitlement without any extra lookup.
 */
export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return json({ error: 'stripe_not_configured' }, 503);
  }
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const userId = (body.user_id || '').trim();
  if (!userId) return json({ error: 'missing_user_id' }, 400);

  const site = env.SITE_URL || new URL(request.url).origin;
  const form = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    client_reference_id: userId,
    'metadata[supabase_user_id]': userId,
    'subscription_data[metadata][supabase_user_id]': userId,
    success_url: site + '/arcade/archive/?checkout=success',
    cancel_url: site + '/arcade/archive/?checkout=cancelled',
    allow_promotion_codes: 'true'
  });
  if (body.email) form.set('customer_email', body.email);

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

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
