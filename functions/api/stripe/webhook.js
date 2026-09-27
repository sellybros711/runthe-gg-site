/* Run The Arcade Pro and the premium bundles : Stripe webhook (Cloudflare Pages Function)
 *
 * POST /api/stripe/webhook. Point a Stripe webhook endpoint here with events:
 *   checkout.session.completed
 *   checkout.session.async_payment_succeeded
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.paid                 (a yearly plan renewing)
 *   charge.refunded              (a full refund on a yearly plan's invoice)
 *   charge.dispute.created       (a chargeback on one)
 *
 * Required Pages env vars:
 *   STRIPE_SECRET_KEY        sk_...
 *   STRIPE_WEBHOOK_SECRET    whsec_...
 *   SUPABASE_URL             https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE    service-role key (server-side only, NEVER shipped to the client)
 *   STRIPE_PRICE_PS_YEAR, STRIPE_PRICE_RTB_YEAR   to recognise a yearly plan by its price
 *
 * THREE THINGS ARE SOLD THROUGH HERE AND THEY NEVER SHARE A TABLE.
 *
 *   The Arcade Card     a subscription, one row in `subscriptions` per account (53)
 *   a one-time bundle   rows in premium_unlocks with no end date (101)
 *   a yearly plan       a row in premium_subscriptions per plan, and premium_unlocks
 *                       rows whose end the plan keeps moving (124)
 *
 * A YEARLY PLAN IS TOLD APART FROM AN ARCADE CARD BY ITS PRICE FIRST and its metadata
 * second, and it must never reach upsertSub: that writes the Arcade table on user_id,
 * so a Perfect Season plan landing there would overwrite a real Arcade Card and hand
 * the account unlimited arcade plays. The price is asked first because a plan changed
 * in the Customer Portal keeps the metadata it was bought with.
 *
 * THE WEBHOOK IS THE ONLY GRANTOR. The checkout never writes an unlock, and every
 * yearly plan event goes through premium_sub_apply() (124), which decides from the
 * plan's status rather than from which event arrived, because Stripe delivers events
 * out of order and more than once. That function also holds the lifetime rule: a row
 * with no end date is never touched by anything a plan does.
 *
 * A one-time bundle is granted once the session owes nothing, which is payment_status
 * 'paid' OR 'no_payment_required' (a 100% off promotion code); a delayed payment method
 * fires completed unpaid first and async_payment_succeeded later.
 *
 * AND ONE BUNDLE RENEWS WITHOUT BEING A YEARLY PLAN: Run The Diamond Pro, $14.99 a
 * year (`recurring` in _bundles.js). Its subscription carries the bundle key, and every
 * event about it is written by grantRecurring as the same premium_unlocks row with an
 * end date that follows the subscription. It never reaches upsertSub either. Routing
 * order, which is load bearing: a yearly plan (price, then metadata) first, then a
 * recurring bundle (metadata), then the Arcade Card.
 */
import { bundleByKey, yearlyBonus, bundleForYearPrice } from './_bundles.js';

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
    await handleEvent(env, type, obj);
  } catch (e) {
    // release the claim so Stripe's retry can reprocess this event
    if (claim === 'new') await unclaimEvent(env, event.id);
    // surface the real reason in the response body: this is only visible to the
    // account owner in the Stripe dashboard's delivery log, never to end users.
    return new Response('handler error: ' + ((e && e.message) ? e.message : String(e)), { status: 500 });
  }
  return new Response('ok');
}

/* EXPORTED FOR scripts/stripe/replay-webhook.mjs, which drives every event kind through
   this function against a real Postgres with the signature check already behind it. It
   is the same function the endpoint calls, so the replay is not a second copy of it. */
export async function handleEvent(env, type, obj) {
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    const userId = obj.client_reference_id || (obj.metadata && obj.metadata.supabase_user_id);
    const bundleKey = obj.metadata && obj.metadata.bundle;
    if (obj.mode === 'subscription' && obj.subscription) {
      const sub = await stripeGet(env, '/v1/subscriptions/' + stripeId(obj.subscription));
      const plan = planOf(env, sub, bundleKey);
      const rec = !plan && bundleKey && bundleByKey(bundleKey);
      if (plan) {
        await applyPlan(env, sub, plan, 'grant', userId);
      } else if (userId && rec && rec.recurring) {
        // a recurring bundle's first checkout: the subscription says how long.
        if (obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required') {
          await grantRecurring(env, userId, bundleKey, sub);
        }
      } else if (userId) {
        await upsertSub(env, userId, obj.customer, sub);
      }
    } else if (userId && obj.mode === 'payment' && bundleKey) {
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
      const sub = await stripeGet(env, '/v1/subscriptions/' + stripeId(obj.subscription));
      await upsertSub(env, userId, obj.customer, sub);
    }
  } else if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const plan = planOf(env, obj, null);
    const userId = obj.metadata && obj.metadata.supabase_user_id;
    const bundleKey = obj.metadata && obj.metadata.bundle;
    if (plan) {
      await applyPlan(env, obj, plan, type === 'customer.subscription.deleted' ? 'delete' : 'update', null);
    } else if (userId && bundleKey) {
      /* A RECURRING BUNDLE (Run The Diamond Pro). READ BACK FROM STRIPE rather than
         trusting the event, because events arrive out of order: an old "updated,
         active" landing after "deleted" would hand a cancelled subscriber another
         year. The subscription as it stands now is the answer whatever order the news
         came in. A deleted subscription still answers, with status canceled. */
      const sub = await stripeGet(env, '/v1/subscriptions/' + obj.id);
      await grantRecurring(env, userId, bundleKey, sub);
    } else if (userId) {
      await upsertSub(env, userId, obj.customer, obj);
    }
  } else if (type === 'invoice.paid') {
    /* A RENEWAL. The first invoice of a plan is paid too, often a moment before the
       checkout session completes, which is fine: every call is idempotent, and the Run
       The Bundle bonus is written insert if absent by 124, so whichever event lands
       first hands it over and every later one finds it there. The Arcade Card keeps
       being run off its own subscription events, exactly as before. */
    const subId = invoiceSubId(obj);
    if (subId) {
      const sub = await stripeGet(env, '/v1/subscriptions/' + subId);
      const plan = planOf(env, sub, null);
      if (plan) await applyPlan(env, sub, plan, 'renew', null);
    }
  } else if (type === 'charge.refunded' || type === 'charge.dispute.created') {
    /* A FULL REFUND OR A CHARGEBACK ON A PLAN'S INVOICE ends that plan's access now.
       A partial refund is a goodwill gesture and changes nothing. A charge that is not
       a plan's (a one-time bundle, the Arcade Card) is left alone here: a lifetime
       row is never cut by anything, and the Arcade Card has never been. */
    let charge = obj;
    if (type === 'charge.dispute.created') {
      charge = obj.charge && typeof obj.charge === 'object'
        ? obj.charge : await stripeGet(env, '/v1/charges/' + stripeId(obj.charge));
    } else if (!fullyRefunded(obj)) {
      return;
    }
    const subId = await chargeSubId(env, charge);
    if (subId) {
      const sub = await stripeGet(env, '/v1/subscriptions/' + subId);
      const plan = planOf(env, sub, null);
      if (plan) await applyPlan(env, sub, plan, 'refund', null);
    }
  }
}

/* WHICH YEARLY PLAN a subscription is, or null for anything else (the Arcade Card). */
function planOf(env, sub, hint) {
  const byPrice = bundleForYearPrice(env, subPrice(sub));
  if (byPrice) return byPrice;
  const meta = (sub && sub.metadata && sub.metadata.bundle) || hint;
  const b = meta ? bundleByKey(meta) : null;
  return b && b.year ? meta : null;
}

function subPrice(sub) {
  const it = sub && sub.items && sub.items.data && sub.items.data[0];
  return (it && it.price && it.price.id) || null;
}

/* THE PERIOD END MOVED. Stripe's newer API versions put current_period_end on the
   subscription ITEM rather than on the subscription, so a reader that only asks the old
   place gets undefined on an account pinned to a newer version. Both places, old first. */
function periodEnd(sub) {
  let t = sub && sub.current_period_end;
  if (!t) {
    const it = sub && sub.items && sub.items.data && sub.items.data[0];
    t = it && it.current_period_end;
  }
  return t ? new Date(t * 1000).toISOString() : null;
}

function stripeId(v) {
  return (v && typeof v === 'object') ? v.id : v;
}

/* An invoice names its subscription in one of two places depending on the API version. */
function invoiceSubId(inv) {
  if (!inv) return null;
  if (inv.subscription) return stripeId(inv.subscription);
  const d = inv.parent && inv.parent.subscription_details;
  return (d && d.subscription) ? stripeId(d.subscription) : null;
}

function fullyRefunded(charge) {
  if (!charge) return false;
  if (charge.refunded === true) return true;
  return charge.amount > 0 && charge.amount_refunded >= charge.amount;
}

/* The subscription a charge paid for. Older API versions put the invoice on the charge;
   newer ones only link them through invoice_payments on the payment intent. */
async function chargeSubId(env, charge) {
  let invId = charge && charge.invoice ? stripeId(charge.invoice) : null;
  /* AN OLDER API VERSION SAYS invoice: null OUTRIGHT for a charge that no invoice made (a
     one-time bundle, a coin bucket), and that is the answer: nothing to look up. Only a
     charge with no invoice FIELD at all is the newer shape, where the link lives on
     invoice_payments. That endpoint does not exist on an older version, so the lookup is
     soft: throwing here would 500 every refund of a one-time bundle and Stripe would retry
     it for three days, over a charge this function has no business with anyway. */
  if (!invId && charge && !('invoice' in charge) && charge.payment_intent) {
    try {
      const pi = stripeId(charge.payment_intent);
      const list = await stripeGet(env, '/v1/invoice_payments?payment%5Btype%5D=payment_intent' +
        '&payment%5Bpayment_intent%5D=' + encodeURIComponent(pi) + '&limit=1');
      const row = list && list.data && list.data[0];
      invId = row && row.invoice ? stripeId(row.invoice) : null;
    } catch (e) { invId = null; }
  }
  if (!invId) return null;
  const inv = await stripeGet(env, '/v1/invoices/' + encodeURIComponent(invId));
  return invoiceSubId(inv);
}

/* ONE CALL, EVERY PLAN EVENT. premium_sub_apply (supabase/124) does the deciding; this
   only reads the subscription out of Stripe's shape. The account comes from the
   subscription's own metadata, and a plan whose row already exists keeps its account
   whatever an event says (the function refuses a plan that changes hands).
   A database without 124 answers 404 for the function, which throws, so Stripe retries.
   That cannot happen in practice: the checkout only sells a plan once the database
   answers premium_yearly_ready(). */
async function applyPlan(env, sub, bundle, kind, userHint) {
  const meta = (sub && sub.metadata) || {};
  const ended = sub.ended_at || (sub.status === 'canceled' ? sub.canceled_at : null);
  const body = {
    p_sub_id: sub.id,
    p_user: meta.supabase_user_id || userHint || null,
    p_bundle: bundle,
    p_status: kind === 'refund' ? null : (sub.status || null),
    p_period_end: kind === 'refund' ? null : periodEnd(sub),
    p_cancel: typeof sub.cancel_at_period_end === 'boolean' ? sub.cancel_at_period_end : null,
    p_ended_at: ended ? new Date(ended * 1000).toISOString() : null,
    p_customer: stripeId(sub.customer) || null,
    p_price: subPrice(sub),
    p_kind: kind,
    p_bonus: yearlyBonus(bundle)
  };
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/premium_sub_apply', {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    var detail = '';
    try { detail = await res.text(); } catch (e) {}
    throw new Error('premium_sub_apply ' + res.status + ' ' + detail);
  }
  return res.json().catch(function () { return null; });
}

// Returns 'new' (first time, claimed), 'dup' (already processed), or 'error'
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
      /* THE CUSTOMER ID TRAVELS WITH THE GRANT, because nothing else records it
       * for a bundle: a one-time payment writes no subscriptions row, so without
       * this the buyer's own receipts are unreachable and /api/stripe/portal has
       * to go back to Stripe with the session id to find them. Written from the
       * session, which is the object that created the customer. */
      payload: Object.assign(
        { checkout_session: session.id, stripe_customer: session.customer || null },
        g.payload || {}
      ),
      expires_at: g.months ? new Date(now.getTime() + g.months * 30.44 * 86400000).toISOString() : null,
      fulfilled_at: g.product === 'runtour_pack' ? null : now.toISOString(),
      granted_at: now.toISOString()
    };
  });

  /* THROUGH 124 WHEN IT IS THERE. premium_grant_bundle() applies the same grants with
     the rules a yearly plan needs: a timed product adds its months to the later of now
     and what the row already had (so a bundle's Arcade year cannot shorten a plan that
     is keeping the card alive), and the bonus row is insert if absent. */
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE,
    'Content-Type': 'application/json'
  };
  const rpc = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/premium_grant_bundle', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      p_user: userId,
      p_bundle: bundleKey,
      p_grants: bundle.grants,
      p_payload: { checkout_session: session.id, stripe_customer: session.customer || null }
    })
  });
  if (rpc.ok) return;
  if (rpc.status !== 404) {
    var why = '';
    try { why = await rpc.text(); } catch (e) {}
    throw new Error('premium_grant_bundle ' + rpc.status + ' ' + why);
  }

  /* A DATABASE WITHOUT 124: the upsert this webhook has always made, in two requests.
     The bonus row goes INSERT IF ABSENT (ignore-duplicates) and never through the merge:
     a merge re-sends fulfilled_at as null over a row the golf side has already paid out,
     and 103's redeem would pay the coins a second time. */
  const once = rows.filter(function (r) { return r.product === 'runtour_pack'; });
  const rest = rows.filter(function (r) { return r.product !== 'runtour_pack'; });
  const post = async function (list, prefer) {
    if (!list.length) return;
    const res = await fetch(env.SUPABASE_URL + '/rest/v1/premium_unlocks?on_conflict=user_id,product', {
      method: 'POST',
      headers: Object.assign({ Prefer: prefer }, headers),
      body: JSON.stringify(list)
    });
    if (!res.ok) {
      var detail = '';
      try { detail = await res.text(); } catch (e) {}
      throw new Error('supabase bundle upsert ' + res.status + ' ' + detail);
    }
  };
  await post(rest, 'resolution=merge-duplicates');
  await post(once, 'resolution=ignore-duplicates');
}

/* WHEN A RECURRING GRANT RUNS OUT, from the subscription as Stripe has it.
 *
 *   active, trialing   the end of the paid period, plus a grace of three days so a
 *                      renewal that lands a few hours late never locks anybody out
 *   past_due           a week from now: the renewal failed and Stripe is retrying.
 *                      The period has already moved forward, so honouring it would
 *                      hand a failed card a free year. A paid retry comes back
 *                      as active and moves the date out again.
 *   anything else      now (canceled, unpaid, incomplete, paused)
 *
 * A subscription cancelled at the period's end stays `active` until then, so it
 * keeps what it paid for and no special case is needed. The period end moved from
 * the subscription onto its items in newer API versions, so both are read. */
function recurringEnd(sub, nowMs) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const end = sub.current_period_end || (item && item.current_period_end) || 0;
  const GRACE = 3 * 86400000;
  if ((sub.status === 'active' || sub.status === 'trialing') && end) return new Date(end * 1000 + GRACE);
  if (sub.status === 'past_due') return new Date(nowMs + 7 * 86400000);
  return new Date(nowMs);
}

async function grantRecurring(env, userId, bundleKey, sub) {
  const bundle = bundleByKey(bundleKey);
  if (!bundle) throw new Error('unknown bundle ' + bundleKey);
  const now = new Date();
  const expires = recurringEnd(sub, now.getTime()).toISOString();
  const customer = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null;

  for (const g of bundle.grants) {
    /* A GRANT WITH NO END IS NEVER GIVEN ONE. Somebody who bought the $9.99
       lifetime Pro, or was comped, owns it for good, and a subscription event for
       the same account (which checkout refuses to sell them, but a dashboard can
       still create) must not turn forever into a year. */
    const have = await pgFirst(env, 'premium_unlocks?user_id=eq.' + encodeURIComponent(userId) +
      '&product=eq.' + encodeURIComponent(g.product) + '&select=expires_at,source&limit=1');
    if (have && !have.expires_at && String(have.source || '').indexOf('subscription:') !== 0) continue;

    const row = {
      user_id: userId,
      product: g.product,
      source: 'subscription:' + bundleKey,
      payload: { stripe_subscription: sub.id, stripe_customer: customer, status: sub.status,
        cancel_at_period_end: !!sub.cancel_at_period_end },
      expires_at: expires,
      fulfilled_at: now.toISOString()
    };
    /* granted_at is when Pro STARTED, and a renewal is not a start: it is written
       on the first grant only, so the receipt keeps the day they signed up. */
    if (!have) row.granted_at = now.toISOString();
    const res = await fetch(env.SUPABASE_URL + '/rest/v1/premium_unlocks?on_conflict=user_id,product', {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([row])
    });
    if (!res.ok) {
      var detail = '';
      try { detail = await res.text(); } catch (e) {}
      throw new Error('supabase recurring upsert ' + res.status + ' ' + detail);
    }
  }
}

async function pgFirst(env, q) {
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + q, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE }
  });
  if (!r.ok) throw new Error('supabase read ' + r.status);
  const rows = await r.json();
  return (rows && rows[0]) || null;
}

async function upsertSub(env, userId, customerId, sub) {
  const row = {
    user_id: userId,
    stripe_customer_id: customerId || null,
    stripe_sub_id: sub.id,
    price_id: (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id) || null,
    status: sub.status,
    /* NOT sub.current_period_end ALONE. On a newer Stripe API version that field is on
       the subscription item, so reading only the old place wrote null, and
       arcade_card_active() reads a null period end as "no end": a card that lapsed would
       have stayed active for ever. periodEnd() asks both places. */
    current_period_end: periodEnd(sub),
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
