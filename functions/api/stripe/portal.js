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
  if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    return json({ error: 'stripe_not_configured' }, 503);
  }
  let body = {};
  try { body = await request.json(); } catch (e) {}

  // Authenticated user only, derived from the session token — never the body.
  const userId = await verifyUser(env, request);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  // find this user's Stripe customer
  let customer = null;
  try {
    const r = await fetch(
      env.SUPABASE_URL + '/rest/v1/subscriptions?user_id=eq.' + encodeURIComponent(userId) + '&select=stripe_customer_id&limit=1',
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE } }
    );
    if (r.ok) { const rows = await r.json(); customer = rows && rows[0] && rows[0].stripe_customer_id; }
  } catch (e) {}
  if (!customer) return json({ error: 'no_customer' }, 404);

  const site = env.SITE_URL || new URL(request.url).origin;
  let ret = typeof body.return_path === 'string' ? body.return_path : '/arcade/';
  if (!/^\/arcade\//.test(ret)) ret = '/arcade/';

  const form = new URLSearchParams({ customer: customer, return_url: site + ret });
  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
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
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
