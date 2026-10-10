/* Premium bundles : Stripe Checkout (Cloudflare Pages Function)
 *
 * POST /api/stripe/checkout-bundle
 *   body: { bundle: "perfect-season"|"run-the-bundle"|"diamond-pro"|"floor-pro",
 *           plan?: "once"|"year", email?, return_path? }
 *   -> { url: "https://checkout.stripe.com/..." }
 *
 * Required Pages env vars (Settings -> Environment variables):
 *   STRIPE_SECRET_KEY                 sk_live_... / sk_test_...
 *   STRIPE_PRICE_PS_PREMIUM_BUNDLE    price_...  (Perfect Season Premium Bundle, one-time)
 *   STRIPE_PRICE_RUN_THE_BUNDLE       price_...  (Run The Bundle, one-time)
 *   STRIPE_PRICE_PS_YEAR              price_...  (Perfect Season, $19.99 a year)
 *   STRIPE_PRICE_RTB_YEAR             price_...  (Run The Bundle, $34.99 a year)
 *   STRIPE_PRICE_RTD_PRO              price_...  (Run The Diamond Pro, $14.99 a year, RECURRING)
 *   STRIPE_PRICE_RTF_PRO              price_...  (Run The Floor Pro, $14.99 a year, RECURRING)
 *   SITE_URL                          https://runthe.gg
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE
 *
 * ONCE OR YEARLY IS _offer.js's ANSWER, and the page must have drawn the same one. The
 * page sends the plan it showed; if that is not what is on sale now (the switch flipped
 * while the sheet was open, or a page cached from before the switch sends nothing), this
 * answers 409 offer_changed with the plan that IS on sale and the page redraws. Nobody
 * is charged for something other than what the screen in front of them said.
 *
 * THE YEARLY RULES, the owner's, in the order they are checked:
 *   - a lifetime Perfect Season or lifetime Run The Bundle owner is refused Perfect
 *     Season yearly: 409 already_owned
 *   - a lifetime Run The Bundle owner is refused Run The Bundle yearly too (owner's call,
 *     2026-09): both games are theirs for good and the bonus was already handed over
 *   - a lifetime Perfect Season owner MAY buy Run The Bundle yearly at full price, and
 *     gets the Arcade Card and the one-time bonus
 *   - a live yearly plan is refused a second copy, and a Perfect Season plan is refused
 *     Run The Bundle on top: 409 already_subscribed, and the page sends them to the
 *     Customer Portal, where a plan is changed or cancelled rather than doubled
 *   - a Fantasy Challenge pass is not ownership (the source filter below)
 *
 * NOT LIVE UNTIL THE ENV VARS SAY SO. With either price var unset this endpoint
 * answers 503 stripe_not_configured for that bundle, which is the same posture
 * the Arcade checkout takes and the reason this file can ship ahead of any
 * launch decision.
 *
 * mode is 'payment' for a bundle sold once and 'subscription' for a yearly plan. The
 * webhook grants a one-time bundle from checkout.session.completed (payment_status
 * paid) or checkout.session.async_payment_succeeded, keyed by metadata.bundle, and a
 * plan from the same events plus invoice.paid and the subscription's own events, keyed
 * by the subscription's metadata and its price.
 *
 * A `recurring` catalog row (Run The Diamond Pro) opens in 'subscription' mode too,
 * whatever the yearly switch says, because Stripe refuses a recurring Price in payment
 * mode. It is not a yearly plan in the sense above: it has no one-time twin and no
 * switch, and the webhook grants it through grantRecurring rather than 124. The bundle
 * key rides on the SUBSCRIPTION's metadata as well as the session's, since the renewal
 * and cancellation events carry the subscription and nothing else.
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
import { siteBase } from './_site.js';
import { currentPlan } from './_offer.js';

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

  /* Only a bundle with a `year` block has two ways to be sold. The baseball and hoops
     tiers are one-time whatever the switch says, and ignore any plan they are sent. */
  const onSale = bundle.year ? await currentPlan(env) : 'once';
  const asked = body.plan === 'year' ? 'year' : 'once';
  if (bundle.year && asked !== onSale) return json({ error: 'offer_changed', plan: onSale }, 409);
  const yearly = onSale === 'year' && !!bundle.year;

  const price = yearly ? env[bundle.year.envPrice] : env[bundle.envPrice];
  if (!env.STRIPE_SECRET_KEY || !price) return json({ error: 'stripe_not_configured' }, 503);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ error: 'stripe_not_configured' }, 503);

  // Authenticated user only, derived from the session token, never the body.
  const userId = await verifyUser(env, request);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  // One bundle per account (see the header). The client hides the buy button
  // for owners too, but a stale client or direct POST still can't double-sell.
  const own = await lookupOwnership(env, userId, yearly);
  if (own === null) return json({ error: 'stripe_not_configured' }, 503);
  const refusal = yearly ? yearlyRefusal(key, own) : onceRefusal(bundle, own);
  if (refusal) return json(refusal, 409);

  /* THE HOST THEY BOUGHT FROM, not the one in SITE_URL. www.runthe.gg and the apex are
     separate localStorage jars, so returning a www buyer to the apex hands them a signed
     out page and a purchase the browser cannot see. See _site.js. */
  const site = siteBase(env, request);
  // return the player to where they were (defends against open-redirect: the
  // path must live under one of this bundle's own games)
  let ret = typeof body.return_path === 'string' ? body.return_path : bundle.defaultReturn;
  const local = bundle.returnRoots.some(function (root) { return ret.indexOf(root) === 0; });
  if (!local) ret = bundle.defaultReturn;
  const sep = ret.indexOf('?') >= 0 ? '&' : '?';

  /* A subscription session either way: a yearly plan, or a bundle whose only Price is
     recurring (Run The Diamond Pro). */
  const subMode = yearly || !!bundle.recurring;
  const form = new URLSearchParams({
    mode: subMode ? 'subscription' : 'payment',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    client_reference_id: userId,
    'metadata[supabase_user_id]': userId,
    'metadata[bundle]': key,
    'metadata[plan]': yearly ? 'year' : 'once',
    success_url: site + ret + sep + 'checkout=success' + (yearly ? '&plan=year' : ''),
    cancel_url: site + ret + sep + 'checkout=cancelled',
    allow_promotion_codes: 'true'
  });
  if (subMode) {
    /* ON THE SUBSCRIPTION, NOT ONLY THE SESSION. Every event after the first one is
       about the subscription (a renewal, a cancel, a refund on its invoice) and never
       sees the session's metadata, so the account and the plan have to ride on the
       subscription itself or the webhook cannot say whose year just renewed. */
    form.set('subscription_data[metadata][supabase_user_id]', userId);
    form.set('subscription_data[metadata][bundle]', key);
  } else {
    // payment mode creates no Customer by default; always making one gives the
    // buyer receipts and lets a later Arcade subscription reuse it. Subscription
    // mode always makes one and refuses the parameter, so it is set here only.
    form.set('customer_creation', 'always');
  }

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
    if (!subMode) form.set('customer_creation', 'always');
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

/* What this account owns and what it is subscribed to, or null when either read
 * failed: those are different answers, and treating "couldn't check" as "owns nothing"
 * would let a flaky moment sell a second bundle whose coins then vanish. Fail closed
 * with a retryable 503 instead.
 *
 * A FANTASY CHALLENGE PASS IS NOT OWNING THE BUNDLE. The weekly winner gets 30 days of
 * Pro as premium_unlocks rows with source 'fantasy:<season>-w<week>' and an end date
 * (supabase/120_fantasy_pro_pass.sql). Counted here, a winner could never buy the
 * bundle: not during the pass, and not after it ended either, because the row outlives
 * its end date as a record of the win.
 *
 * AND A ROW THAT HAS ENDED IS NOT OWNERSHIP EITHER. A lapsed yearly plan leaves its rows
 * behind as the record of it, and somebody coming back to buy again must not be told
 * they already own something the gate has stopped honouring.
 *
 * The plans are only read when a plan is being sold: a database without 124 has no such
 * table, and the one-time path never needs it. */
async function lookupOwnership(env, userId, yearly) {
  const h = { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE };
  const uid = encodeURIComponent(userId);
  try {
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/premium_unlocks?user_id=eq.' + uid +
      '&source=not.like.fantasy:*&select=product,source,expires_at', { headers: h });
    if (!r.ok) return null;
    const rows = (await r.json()) || [];
    let subs = [];
    if (yearly) {
      const s = await fetch(env.SUPABASE_URL + '/rest/v1/premium_subscriptions?user_id=eq.' + uid +
        '&select=bundle,status,access_until,cancel_at_period_end', { headers: h });
      if (!s.ok) return null;
      subs = (await s.json()) || [];
    }
    return { rows: rows, subs: subs };
  } catch (e) { return null; }
}

const LIVE = ['active', 'trialing', 'past_due'];
function liveRow(row, now) {
  return row.expires_at == null || Date.parse(row.expires_at) > now;
}

/* The one-time bundle: refused when the account holds any of its products right now. */
function onceRefusal(bundle, own) {
  const now = Date.now();
  const held = own.rows.filter(function (r) { return liveRow(r, now); })
    .map(function (r) { return r.product; });
  const clash = bundle.grants.some(function (g) { return held.indexOf(g.product) >= 0; });
  return clash ? { error: 'already_owned' } : null;
}

/* The yearly plans: the owner's rules, in the order the header lists them. */
function yearlyRefusal(key, own) {
  const now = Date.now();
  const lifetime = own.rows.filter(function (r) { return r.expires_at == null; });
  const lifetimePS = lifetime.some(function (r) {
    return r.product === 'ps_premium' || r.product === 'cfb_premium';
  });
  const lifetimeRTB = lifetime.some(function (r) { return r.source === 'bundle:run-the-bundle'; });
  const plans = own.subs.filter(function (s) {
    return LIVE.indexOf(s.status) >= 0 && (s.access_until == null || Date.parse(s.access_until) > now);
  });
  const has = function (b) { return plans.some(function (s) { return s.bundle === b; }); };

  if (key === 'perfect-season') {
    if (lifetimePS) return { error: 'already_owned' };
    if (plans.length) return { error: 'already_subscribed' };
  } else if (key === 'run-the-bundle') {
    if (lifetimeRTB) return { error: 'already_owned' };
    if (has('run-the-bundle')) return { error: 'already_subscribed' };
    if (has('perfect-season')) return { error: 'already_subscribed', change: true };
  }
  return null;
}

// Best-effort: a Stripe customer this account already has, from an Arcade Card or a
// yearly plan, so one person is one customer with one set of receipts.
async function lookupCustomer(env, userId) {
  const h = { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE };
  const uid = encodeURIComponent(userId);
  const tries = [
    'subscriptions?user_id=eq.' + uid + '&select=stripe_customer_id&limit=1',
    'premium_subscriptions?user_id=eq.' + uid + '&stripe_customer_id=not.is.null' +
      '&select=stripe_customer_id&order=updated_at.desc&limit=1'
  ];
  for (const q of tries) {
    try {
      const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + q, { headers: h });
      if (!r.ok) continue;
      const rows = await r.json();
      const c = rows && rows[0] && rows[0].stripe_customer_id;
      if (c) return c;
    } catch (e) {}
  }
  return null;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
