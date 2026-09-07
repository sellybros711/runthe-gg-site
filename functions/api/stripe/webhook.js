/* Run The Arcade Pro — Stripe webhook (Cloudflare Pages Function)
 *
 * POST /api/stripe/webhook — point a Stripe webhook endpoint here with events:
 *   checkout.session.completed
 *   checkout.session.async_payment_succeeded
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
 *
 * Also grants the one-time premium bundles (see _bundles.js): a checkout
 * session in payment mode carrying metadata.bundle upserts one premium_unlocks
 * row per product in the bundle (supabase/101_premium_bundles.sql). Grants
 * happen once the session owes nothing, which is payment_status 'paid' OR
 * 'no_payment_required' (a 100% off promotion code); a delayed payment method
 * fires completed unpaid first and async_payment_succeeded later, which is why
 * that event is on the list above.
 */
import { bundleByKey } from './_bundles.js';

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

  // Idempotency: claim the event id once. A duplicate delivery is acknowledged
  // without reprocessing. If the dedupe table is missing we fail OPEN (process
  // anyway) since the entitlement upsert is itself idempotent.
  const claim = await claimEvent(env, event.id, type);
  if (claim === 'dup') return new Response('ok (dup)');

  try {
    if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
      const userId = obj.client_reference_id || (obj.metadata && obj.metadata.supabase_user_id);
      const bundleKey = obj.metadata && obj.metadata.bundle;
      if (userId && obj.mode === 'payment' && bundleKey) {
        // one-time premium bundle: grant once nothing is owed on the session.
        //
        // TWO STATUSES MEAN THAT, not one. 'paid' is the ordinary sale.
        // 'no_payment_required' is a session with nothing left to charge,
        // which is what a 100% off promotion code produces, and checkout
        // sends allow_promotion_codes. Gating on 'paid' alone takes the order
        // and grants nothing: the comp'd buyer gets a receipt for a bundle
        // they do not own, and no error is raised anywhere, because from
        // Stripe's side the session completed exactly as asked.
        //
        // Neither status can be reached without Stripe saying so, and a free
        // session still needs a promotion code we created, so this is not a
        // way in. A completed-but-UNPAID session (a delayed payment method) is
        // still refused here; async_payment_succeeded brings it back paid.
        if (obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required') {
          await grantBundle(env, userId, bundleKey, obj);
        }
      } else if (userId && obj.subscription) {
        // fetch the subscription for status + period end
        const sub = await stripeGet(env, '/v1/subscriptions/' + obj.subscription);
        await upsertSub(env, userId, obj.customer, sub);
      }
    } else if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      const userId = obj.metadata && obj.metadata.supabase_user_id;
      if (userId) await upsertSub(env, userId, obj.customer, obj);
    }
  } catch (e) {
    // release the claim so Stripe's retry can reprocess this event
    if (claim === 'new') await unclaimEvent(env, event.id);
    // surface the real reason in the response body — this is only visible to the
    // account owner in the Stripe dashboard's delivery log, never to end users.
    return new Response('handler error: ' + ((e && e.message) ? e.message : String(e)), { status: 500 });
  }
  return new Response('ok');
}

// Returns 'new' (first time — claimed), 'dup' (already processed), or 'error'
// (couldn't reach the dedupe table → caller fails open and processes anyway).
async function claimEvent(env, id, type) {
  if (!id) return 'error';
  try {
    const res = await fetch(env.SUPABASE_URL + '/rest/v1/stripe_events', {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ id: id, type: type || null })
    });
    if (res.status === 409) return 'dup';        // unique violation → already handled
    if (res.ok) return 'new';
    return 'error';
  } catch (e) { return 'error'; }
}
async function unclaimEvent(env, id) {
  try {
    await fetch(env.SUPABASE_URL + '/rest/v1/stripe_events?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE }
    });
  } catch (e) {}
}

/* One paid bundle -> one premium_unlocks row per product, in a single upsert.
 *
 * Idempotent two ways at once: the stripe_events claim stops a redelivered
 * event, and merge-duplicates on (user_id, product) makes a replayed grant a
 * refresh rather than a double. The double-sell risk (a second Run The Bundle
 * whose coins would merge away) is closed upstream, where checkout-bundle.js
 * refuses a buyer who owns any of the products.
 *
 * fulfilled_at: stamped now for products the database itself honors from here
 * on (the game pages read premium_products(), arcade_card_active() reads the
 * arcade year). Left null for runtour_pack, whose coins live in the golf
 * backend's wallet: the null is the golf side's work queue, and the README's
 * go-live checklist says that redemption must exist before this bundle sells.
 *
 * An unknown bundle key throws rather than acks: metadata.bundle is written by
 * our own checkout endpoint, so a key we don't recognize means the catalog and
 * a live session disagree, and a Stripe retry loop in the delivery log is the
 * alarm that says so. */
async function grantBundle(env, userId, bundleKey, session) {
  const bundle = bundleByKey(bundleKey);
  if (!bundle) throw new Error('unknown bundle ' + bundleKey);

  const now = new Date();
  const rows = bundle.grants.map(function (g) {
    return {
      user_id: userId,
      product: g.product,
      source: 'bundle:' + bundleKey,
      payload: Object.assign({ checkout_session: session.id }, g.payload || {}),
      expires_at: g.months ? new Date(now.getTime() + g.months * 30.44 * 86400000).toISOString() : null,
      fulfilled_at: g.product === 'runtour_pack' ? null : now.toISOString(),
      granted_at: now.toISOString()
    };
  });

  const res = await fetch(env.SUPABASE_URL + '/rest/v1/premium_unlocks?on_conflict=user_id,product', {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    var detail = '';
    try { detail = await res.text(); } catch (e) {}
    throw new Error('supabase bundle upsert ' + res.status + ' ' + detail);
  }
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
  if (!res.ok) {
    var detail = '';
    try { detail = await res.text(); } catch (e) {}
    throw new Error('supabase upsert ' + res.status + ' ' + detail);
  }
}

async function stripeGet(env, path) {
  const res = await fetch('https://api.stripe.com' + path, {
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY }
  });
  if (!res.ok) {
    var detail = '';
    try { detail = await res.text(); } catch (e) {}
    throw new Error('stripe get ' + res.status + ' ' + path + ' ' + detail);
  }
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
