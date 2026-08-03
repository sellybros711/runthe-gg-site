/* Run The Arcade Pro — Stripe webhook (Cloudflare Pages Function)
 *
 * POST /api/stripe/webhook — point a Stripe webhook endpoint here with events:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *
 * Required Pages env vars:
 *   STRIPE_SECRET_KEY        sk_...
 *   STRIPE_WEBHOOK_SECRET    whsec_...
 *   SUPABASE_URL             https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE    service-role key (server-side only — NEVER shipped to the client)
 *
 * Grants/updates the `subscriptions` row for the Supabase user carried in
 * client_reference_id / metadata.supabase_user_id. board.js mirrors that row
 * into the client's Pro flag.
 */
export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.STRIPE_WEBHOOK_SECRET || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    return new Response('not configured', { status: 503 });
  }

  const payload = await request.text();
  const sig = request.headers.get('stripe-signature') || '';
  if (!(await verifyStripeSig(payload, sig, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response('bad signature', { status: 400 });
  }

  const event = JSON.parse(payload);
  const type = event.type;
  const obj = event.data && event.data.object;

  try {
    if (type === 'checkout.session.completed') {
      const userId = obj.client_reference_id || (obj.metadata && obj.metadata.supabase_user_id);
      if (userId && obj.subscription) {
        // fetch the subscription for status + period end
        const sub = await stripeGet(env, '/v1/subscriptions/' + obj.subscription);
        await upsertSub(env, userId, obj.customer, sub);
      }
    } else if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      const userId = obj.metadata && obj.metadata.supabase_user_id;
      if (userId) await upsertSub(env, userId, obj.customer, obj);
    }
  } catch (e) {
    return new Response('handler error', { status: 500 });
  }
  return new Response('ok');
}

async function upsertSub(env, userId, customerId, sub) {
  const row = {
    user_id: userId,
    stripe_customer_id: customerId || null,
    stripe_sub_id: sub.id,
    price_id: (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id) || null,
    status: sub.status,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    updated_at: new Date().toISOString()
  };
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/subscriptions?on_conflict=user_id', {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error('supabase upsert failed ' + res.status);
}

async function stripeGet(env, path) {
  const res = await fetch('https://api.stripe.com' + path, {
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY }
  });
  if (!res.ok) throw new Error('stripe get failed');
  return res.json();
}

/* Stripe signature: v1 = HMAC-SHA256 of "<timestamp>.<payload>" with the
 * webhook secret; tolerate 5 minutes of clock drift. */
async function verifyStripeSig(payload, header, secret) {
  const parts = Object.fromEntries(header.split(',').map(function (kv) { return kv.split('='); }));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(parts.t + '.' + payload));
  const hex = Array.from(new Uint8Array(mac)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  // constant-time-ish compare
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}
