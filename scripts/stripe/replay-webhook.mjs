/* Replays Stripe events through the REAL webhook, against a REAL Postgres, and asserts
 * the rules a yearly plan must never break.
 *
 *   node scripts/stripe/replay-webhook.mjs              builds a scratch database, drops it after
 *   node scripts/stripe/replay-webhook.mjs --keep       leaves it there to look at (stripe_replay)
 *
 * Needs psql on the PATH and a local Postgres the current user can create a database on.
 *
 * WHAT IS REAL AND WHAT IS NOT. The webhook is imported and called whole: the signature
 * check, the stripe_events claim, the routing and every request it makes to Supabase.
 * Those requests are answered by running the same SQL functions PostgREST would, in a
 * database built from this repo's own migrations (the chain supabase/test/
 * premium_yearly_test.sql lists). Only Stripe's API is a stand in: the subscriptions,
 * invoices and charges the webhook asks for are fixtures, shaped the way Stripe sends
 * them on both sides of its 2025 API change (current_period_end on the item, an invoice
 * found through invoice_payments). NOTHING HERE REACHES STRIPE: every fetch is answered
 * locally and an unexpected one fails the run.
 *
 * THE INVARIANTS, asserted after every single event rather than at the end, because the
 * way these break is one event in the middle of a sequence:
 *   - a lifetime row never gets an end date, and never changes source or payload
 *   - a Fantasy pass's own end (grant_until) is never moved by a plan event
 *   - no row ever ends before its pass does
 *   - the Run The Bundle bonus row exists at most once and, once stamped, stays stamped
 *   - a Perfect Season plan never writes the Arcade Card's subscriptions table
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url);
const repo = (p) => new URL(p, root).pathname;
const KEEP = process.argv.includes('--keep');
const DB = 'stripe_replay';

let failed = 0, passed = 0;
const ok = (label, cond, detail) => {
  if (cond) { passed++; console.log('  ok  ' + label); }
  else { failed++; console.error('FAIL  ' + label + (detail ? '   ' + detail : '')); }
};

// ─── the database ───────────────────────────────────────────────────────────
function sh(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(cmd + ' ' + args.join(' ') + '\n' + r.stderr + r.stdout);
  return r.stdout;
}
function sql(q) {
  return sh('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', DB], q).trim();
}
function sqlFile(path) { sh('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-f', path]); }
const lit = (v) => {
  if (v === null || v === undefined) return 'null';
  const tag = '$j' + Math.random().toString(36).slice(2, 8) + '$';
  return tag + String(typeof v === 'object' ? JSON.stringify(v) : v) + tag;
};

function build() {
  spawnSync('dropdb', ['--if-exists', '-f', DB]);
  sh('createdb', [DB]);
  const tmp = mkdtempSync(join(tmpdir(), 'replay-'));
  const dyn = readFileSync(repo('supabase/test/dynboard_base.sql'), 'utf8').split('\n').slice(19).join('\n');
  writeFileSync(join(tmp, 'dyn.sql'), dyn);
  sqlFile(repo('supabase/test/fantasy_base.sql'));
  sqlFile(join(tmp, 'dyn.sql'));
  sqlFile(repo('supabase/98_football_gauntlet_board.sql'));
  sql(`create table public.subscriptions (
         user_id uuid primary key, stripe_customer_id text, stripe_sub_id text unique,
         price_id text, status text not null default 'incomplete',
         current_period_end timestamptz, created_at timestamptz default now(),
         updated_at timestamptz default now());
       create table public.stripe_events (id text primary key, type text,
         created_at timestamptz not null default now());
       create table public.coin_wallet (user_id uuid primary key,
         paid_coins int default 0, lifetime_granted int default 0);`);
  for (const f of ['101_premium_bundles', '107_board_pro_and_live', '109_fantasy_challenge',
    '110_fantasy_live', '111_nfl_scores', '112_fantasy_entrants', '113_fantasy_submit_username',
    '114_fantasy_prizes', '115_fantasy_result_when_ready', '119_fantasy_swap',
    '120_fantasy_pro_pass', '121_baseball_pro', '123_hoops_pro', '103_runtour_bundle_redeem',
    '65_delete_account', '124_premium_yearly']) {
    sqlFile(repo('supabase/' + f + '.sql'));
  }
}

// ─── Stripe, as fixtures ────────────────────────────────────────────────────
const env = {
  STRIPE_SECRET_KEY: 'sk_test_replay',
  STRIPE_WEBHOOK_SECRET: 'whsec_replay',
  SUPABASE_URL: 'http://supabase.replay',
  SUPABASE_SERVICE_ROLE: 'service_role_replay',
  STRIPE_PRICE_PS_YEAR: 'price_ps_year',
  STRIPE_PRICE_RTB_YEAR: 'price_rtb_year',
};
const stripe = { subscriptions: {}, invoices: {}, charges: {}, invoicePayments: {} };
const unix = (d) => Math.floor(d / 1000);
const DAY = 86400000;

/* A subscription the way Stripe returns it. `newApi` puts the period end on the item
   only, which is what an account pinned to a 2025 API version gets. */
function subscription(id, { user, bundle, price, status = 'active', end, cancel = false,
  endedAt = null, newApi = false, customer }) {
  const item = { id: 'si_' + id, price: { id: price } };
  const s = { id, object: 'subscription', status, customer: customer || 'cus_' + id,
    cancel_at_period_end: cancel, ended_at: endedAt ? unix(endedAt) : null,
    canceled_at: status === 'canceled' ? unix(endedAt || Date.now()) : null,
    metadata: user ? { supabase_user_id: user, bundle } : {},
    items: { data: [item] } };
  if (newApi) item.current_period_end = unix(end);
  else s.current_period_end = unix(end);
  stripe.subscriptions[id] = s;
  return s;
}

// ─── fetch: Supabase answered by the database, Stripe by the fixtures ────────
const RPC = {
  premium_yearly_ready: () => sql('select public.premium_yearly_ready()'),
  premium_sub_apply: (b) => sql(`select public.premium_sub_apply(
      p_sub_id => ${lit(b.p_sub_id)}, p_user => ${lit(b.p_user)}::uuid,
      p_bundle => ${lit(b.p_bundle)}, p_status => ${lit(b.p_status)},
      p_period_end => ${lit(b.p_period_end)}::timestamptz, p_cancel => ${b.p_cancel === null || b.p_cancel === undefined ? 'null' : b.p_cancel}::boolean,
      p_ended_at => ${lit(b.p_ended_at)}::timestamptz, p_customer => ${lit(b.p_customer)},
      p_price => ${lit(b.p_price)}, p_kind => ${lit(b.p_kind)},
      p_bonus => ${lit(b.p_bonus)}::jsonb)`),
  premium_grant_bundle: (b) => sql(`select public.premium_grant_bundle(
      ${lit(b.p_user)}::uuid, ${lit(b.p_bundle)}, ${lit(b.p_grants)}::jsonb, ${lit(b.p_payload)}::jsonb)`),
};
const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async function (url, init = {}) {
  const u = new URL(String(url));
  const method = (init.method || 'GET').toUpperCase();
  if (u.host === 'supabase.replay') {
    const path = u.pathname.replace('/rest/v1/', '');
    const body = init.body ? JSON.parse(init.body) : null;
    try {
      if (path.startsWith('rpc/')) {
        const fn = RPC[path.slice(4)];
        if (!fn) return reply(404, { code: 'PGRST202' });
        const out = fn(body || {});
        return reply(200, out === '' ? 'null' : out);
      }
      if (path === 'stripe_events' && method === 'POST') {
        const n = sql(`insert into public.stripe_events (id, type) values (${lit(body.id)}, ${lit(body.type)})
                       on conflict do nothing returning 1`);
        return n ? reply(201, '') : reply(409, { code: '23505' });
      }
      if (path === 'stripe_events' && method === 'DELETE') {
        sql(`delete from public.stripe_events where id = ${lit(u.searchParams.get('id').replace(/^eq\./, ''))}`);
        return reply(204, '');
      }
      if (path === 'subscriptions' && method === 'POST') {
        const r = body;
        sql(`insert into public.subscriptions (user_id, stripe_customer_id, stripe_sub_id, price_id, status, current_period_end, updated_at)
             values (${lit(r.user_id)}::uuid, ${lit(r.stripe_customer_id)}, ${lit(r.stripe_sub_id)}, ${lit(r.price_id)},
                     ${lit(r.status)}, ${lit(r.current_period_end)}::timestamptz, now())
             on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id,
               stripe_sub_id = excluded.stripe_sub_id, price_id = excluded.price_id, status = excluded.status,
               current_period_end = excluded.current_period_end, updated_at = now()`);
        return reply(201, '');
      }
    } catch (e) {
      return reply(400, { message: String(e.message).slice(0, 400) });
    }
    throw new Error('replay: the webhook asked Supabase for something unexpected: ' + method + ' ' + path);
  }
  if (u.host === 'api.stripe.com') {
    const p = u.pathname;
    let m;
    if ((m = p.match(/^\/v1\/subscriptions\/(.+)$/))) {
      const s = stripe.subscriptions[decodeURIComponent(m[1])];
      return s ? reply(200, s) : reply(404, { error: { message: 'no such subscription' } });
    }
    if ((m = p.match(/^\/v1\/invoices\/(.+)$/))) {
      const i = stripe.invoices[decodeURIComponent(m[1])];
      return i ? reply(200, i) : reply(404, { error: { message: 'no such invoice' } });
    }
    if ((m = p.match(/^\/v1\/charges\/(.+)$/))) {
      const c = stripe.charges[decodeURIComponent(m[1])];
      return c ? reply(200, c) : reply(404, { error: { message: 'no such charge' } });
    }
    if (p === '/v1/invoice_payments') {
      const pi = u.searchParams.get('payment[payment_intent]');
      return reply(200, { data: stripe.invoicePayments[pi] ? [stripe.invoicePayments[pi]] : [] });
    }
    throw new Error('replay: the webhook asked Stripe for something unexpected: ' + method + ' ' + p);
  }
  throw new Error('replay: a request left the harness: ' + url);
};

// ─── sending an event, signed ───────────────────────────────────────────────
const { onRequestPost } = await import('../../functions/api/stripe/webhook.js');
let seq = 0;
async function sign(payload) {
  const t = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(t + '.' + payload));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return 't=' + t + ',v1=' + hex;
}
async function send(type, object, id) {
  const eventId = id || 'evt_' + (++seq);
  const payload = JSON.stringify({ id: eventId, type, data: { object } });
  const request = new Request('https://runthe.gg/api/stripe/webhook', {
    method: 'POST', body: payload, headers: { 'stripe-signature': await sign(payload) } });
  const res = await onRequestPost({ env, request });
  const text = await res.text();
  if (res.status !== 200) throw new Error(type + ' answered ' + res.status + ': ' + text);
  checkInvariants(type);
  return text;
}

// ─── the invariants, after every event ──────────────────────────────────────
let lifetimeSnap = null, passSnap = null;
function snapshot() {
  lifetimeSnap = sql(`select coalesce(json_agg(json_build_object('u',user_id,'p',product,'s',source,'pl',payload) order by user_id, product),'[]')
                        from public.premium_unlocks where expires_at is null and product <> 'runtour_pack'`);
  passSnap = sql(`select coalesce(json_agg(json_build_object('u',user_id,'p',product,'g',grant_until) order by user_id, product),'[]')
                    from public.premium_unlocks where source like 'fantasy:%'`);
}
function checkInvariants(after) {
  const life = sql(`select coalesce(json_agg(json_build_object('u',user_id,'p',product,'s',source,'pl',payload) order by user_id, product),'[]')
                      from public.premium_unlocks where expires_at is null and product <> 'runtour_pack'`);
  const lost = JSON.parse(lifetimeSnap).filter((x) => !JSON.parse(life).some((y) =>
    y.u === x.u && y.p === x.p && y.s === x.s && JSON.stringify(y.pl) === JSON.stringify(x.pl)));
  ok('after ' + after + ': every lifetime row is still lifetime and unchanged', lost.length === 0,
    JSON.stringify(lost));
  const pass = sql(`select coalesce(json_agg(json_build_object('u',user_id,'p',product,'g',grant_until) order by user_id, product),'[]')
                      from public.premium_unlocks where grant_until is not null and source like 'fantasy:%'`);
  const moved = JSON.parse(passSnap).filter((x) => !JSON.parse(pass).some((y) => y.u === x.u && y.p === x.p && y.g === x.g));
  ok('after ' + after + ': no plan event moved a Fantasy pass\'s own end', moved.length === 0, JSON.stringify(moved));
  ok('after ' + after + ': no row ends before its pass or its plan',
    sql(`select count(*) from public.premium_unlocks where expires_at is not null
           and expires_at < greatest(grant_until, least(sub_until, now()))`) === '0');
  ok('after ' + after + ': the bonus row is there at most once per account',
    sql(`select count(*) from (select user_id from public.premium_unlocks where product = 'runtour_pack'
           group by user_id having count(*) > 1) z`) === '0');
  ok('after ' + after + ': no yearly plan wrote the Arcade Card table',
    sql(`select count(*) from public.subscriptions where price_id in ('price_ps_year','price_rtb_year')`) === '0');
}
const products = (u) => JSON.parse(sql(`select public.become(${lit(u)}::uuid); select to_json(public.premium_products());`).split('\n').pop());
const row = (u, p) => {
  const r = sql(`select to_json(x) from public.premium_unlocks x where user_id = ${lit(u)}::uuid and product = ${lit(p)}`);
  return r ? JSON.parse(r) : null;
};

// ─── the story ──────────────────────────────────────────────────────────────
console.log('building ' + DB + ' from the migrations');
build();

const L = 'c1000000-0000-0000-0000-000000000001';   // lifetime Perfect Season owner
const P = 'c2000000-0000-0000-0000-000000000002';   // Fantasy pass holder
const Y = 'c3000000-0000-0000-0000-000000000003';   // yearly subscriber
const B = 'c4000000-0000-0000-0000-000000000004';   // Run The Bundle yearly, new API shape
const A = 'c5000000-0000-0000-0000-000000000005';   // Arcade Card member
sql(`insert into auth.users(id) values ('${L}'),('${P}'),('${Y}'),('${B}'),('${A}')`);
snapshot();

console.log('\n-- a lifetime owner, bought through the one-time checkout');
await send('checkout.session.completed', { id: 'cs_L', object: 'checkout.session', mode: 'payment',
  payment_status: 'paid', client_reference_id: L, customer: 'cus_L',
  metadata: { supabase_user_id: L, bundle: 'perfect-season' } });
ok('the one-time bundle is lifetime', row(L, 'ps_premium') && row(L, 'ps_premium').expires_at === null);
snapshot();

console.log('\n-- a refund of the one-time purchase itself changes nothing, in either API shape');
await send('charge.refunded', { id: 'ch_once_old', object: 'charge', invoice: null, payment_intent: 'pi_once',
  amount: 1999, amount_refunded: 1999, refunded: true });
await send('charge.refunded', { id: 'ch_once_new', object: 'charge', payment_intent: 'pi_once',
  amount: 1999, amount_refunded: 1999, refunded: true });
await send('charge.dispute.created', { id: 'dp_once', object: 'dispute',
  charge: { id: 'ch_once_old', object: 'charge', invoice: null, payment_intent: 'pi_once', amount: 1999 } });
ok('a refunded or disputed lifetime purchase is still lifetime (the owner revokes by hand)',
  row(L, 'ps_premium').expires_at === null && products(L).includes('ps_premium'));

console.log('\n-- the same owner buys Run The Bundle yearly, and it goes through every event');
const now = Date.now();
subscription('sub_L', { user: L, bundle: 'run-the-bundle', price: 'price_rtb_year', end: now + 365 * DAY, customer: 'cus_L' });
await send('checkout.session.completed', { id: 'cs_L2', object: 'checkout.session', mode: 'subscription',
  subscription: 'sub_L', customer: 'cus_L', client_reference_id: L,
  metadata: { supabase_user_id: L, bundle: 'run-the-bundle', plan: 'year' } });
ok('the plan adds the Arcade Card', products(L).includes('arcade_card_year'));
ok('and hands over the bonus', !!row(L, 'runtour_pack'));
stripe.invoices.in_L1 = { id: 'in_L1', subscription: 'sub_L' };
subscription('sub_L', { user: L, bundle: 'run-the-bundle', price: 'price_rtb_year', end: now + 730 * DAY, customer: 'cus_L' });
await send('invoice.paid', stripe.invoices.in_L1);
stripe.charges.ch_L = { id: 'ch_L', object: 'charge', invoice: 'in_L1', amount: 3499, amount_refunded: 3499, refunded: true };
await send('charge.refunded', stripe.charges.ch_L);
ok('a full refund takes the Arcade Card back', !products(L).includes('arcade_card_year'));
ok('and leaves both games', products(L).includes('ps_premium') && products(L).includes('cfb_premium'));
subscription('sub_L', { user: L, bundle: 'run-the-bundle', price: 'price_rtb_year', status: 'canceled',
  end: now + 730 * DAY, endedAt: now, customer: 'cus_L' });
await send('customer.subscription.deleted', stripe.subscriptions.sub_L);

console.log('\n-- a Fantasy pass holder subscribes, renews and is refunded');
sql(`insert into public.premium_unlocks (user_id, product, source, payload, grant_until, expires_at, fulfilled_at)
     select '${P}', p, 'fantasy:2026-w30', '{}'::jsonb, now() + interval '25 days', now() + interval '25 days', now()
       from unnest(array['ps_premium','cfb_premium']) p`);
snapshot();
subscription('sub_P', { user: P, bundle: 'perfect-season', price: 'price_ps_year', end: now + 365 * DAY });
await send('checkout.session.completed', { id: 'cs_P', object: 'checkout.session', mode: 'subscription',
  subscription: 'sub_P', customer: 'cus_sub_P', client_reference_id: P,
  metadata: { supabase_user_id: P, bundle: 'perfect-season', plan: 'year' } });
ok('the plan runs past the pass', Date.parse(row(P, 'ps_premium').expires_at) > now + 360 * DAY);
ok('the prize still says Won', /^fantasy:/.test(row(P, 'ps_premium').source));
stripe.invoices.in_P = { id: 'in_P', parent: { subscription_details: { subscription: 'sub_P' } } };
stripe.invoicePayments.pi_P = { invoice: 'in_P' };
stripe.charges.ch_P = { id: 'ch_P', object: 'charge', payment_intent: 'pi_P', amount: 1999, amount_refunded: 1999, refunded: true };
await send('charge.refunded', stripe.charges.ch_P);
ok('a refund found through invoice_payments (the 2025 API) ends the plan',
  Date.parse(row(P, 'ps_premium').expires_at) < now + 30 * DAY);
ok('and the pass is still running', products(P).includes('ps_premium'));

console.log('\n-- a yearly subscriber: partial refund, cancel at period end, delete, and a stale replay');
subscription('sub_Y', { user: Y, bundle: 'perfect-season', price: 'price_ps_year', end: now + 365 * DAY });
await send('checkout.session.completed', { id: 'cs_Y', object: 'checkout.session', mode: 'subscription',
  subscription: 'sub_Y', customer: 'cus_sub_Y', client_reference_id: Y,
  metadata: { supabase_user_id: Y, bundle: 'perfect-season', plan: 'year' } });
ok('the plan opens both games', products(Y).includes('ps_premium') && products(Y).includes('cfb_premium'));
ok('with seven days of grace on the period',
  Math.abs(Date.parse(row(Y, 'ps_premium').expires_at) - (unix(now + 365 * DAY) * 1000 + 7 * DAY)) < 2000);
const dupOk = await send('checkout.session.completed', { id: 'cs_Y', object: 'checkout.session', mode: 'subscription',
  subscription: 'sub_Y', customer: 'cus_sub_Y', client_reference_id: Y,
  metadata: { supabase_user_id: Y, bundle: 'perfect-season' } }, 'evt_' + seq);
ok('a redelivered event is acknowledged and not processed', dupOk === 'ok (dup)');
stripe.invoices.in_Y = { id: 'in_Y', subscription: 'sub_Y' };
await send('charge.refunded', { id: 'ch_Yp', object: 'charge', invoice: 'in_Y', amount: 1999, amount_refunded: 500, refunded: false });
ok('a partial refund changes nothing', products(Y).includes('ps_premium'));
const staleActive = JSON.parse(JSON.stringify(subscription('sub_Y', { user: Y, bundle: 'perfect-season',
  price: 'price_ps_year', end: now + 365 * DAY })));
subscription('sub_Y', { user: Y, bundle: 'perfect-season', price: 'price_ps_year', end: now + 365 * DAY, cancel: true });
await send('customer.subscription.updated', stripe.subscriptions.sub_Y);
ok('cancelling keeps access to the period end', products(Y).includes('ps_premium'));
subscription('sub_Y', { user: Y, bundle: 'perfect-season', price: 'price_ps_year', status: 'canceled',
  end: now + 365 * DAY, endedAt: now - 1000 });
await send('customer.subscription.deleted', stripe.subscriptions.sub_Y);
ok('an immediate end ends it', !products(Y).includes('ps_premium'));
await send('customer.subscription.updated', staleActive);
ok('an "active" delivered late, after the delete, grants nothing', !products(Y).includes('ps_premium'));

console.log('\n-- Run The Bundle on the 2025 API shape: lapse on a failed card, then a late payment');
subscription('sub_B', { user: B, bundle: 'run-the-bundle', price: 'price_rtb_year', end: now - 20 * DAY, newApi: true });
await send('customer.subscription.updated', stripe.subscriptions.sub_B);
ok('a period end read off the ITEM is honoured (and is 13 days past its grace)',
  !products(B).includes('ps_premium'));
subscription('sub_B', { user: B, bundle: 'run-the-bundle', price: 'price_rtb_year', status: 'past_due',
  end: now - 20 * DAY, newApi: true });
await send('customer.subscription.updated', stripe.subscriptions.sub_B);
ok('past due and past its grace: back to the free allowance', products(B).length === 0);
subscription('sub_B', { user: B, bundle: 'run-the-bundle', price: 'price_rtb_year', end: now + 345 * DAY, newApi: true });
stripe.invoices.in_B = { id: 'in_B', parent: { subscription_details: { subscription: 'sub_B' } } };
await send('invoice.paid', stripe.invoices.in_B);
ok('a late payment turns all three back on',
  ['ps_premium', 'cfb_premium', 'arcade_card_year'].every((p) => products(B).includes(p)));
const bonus = row(B, 'runtour_pack');
ok('the bonus is handed over once, unfulfilled', bonus && bonus.fulfilled_at === null && bonus.payload.coins === 100000);
sql(`select public.become('${B}'); select public.runtour_redeem_bundle();`);
await send('invoice.paid', stripe.invoices.in_B, 'evt_renew_again');
subscription('sub_B', { user: B, bundle: 'run-the-bundle', price: 'price_rtb_year', end: now + 710 * DAY, newApi: true });
await send('invoice.paid', stripe.invoices.in_B);
ok('a renewal after the coins landed leaves the bonus row stamped', !!(row(B, 'runtour_pack') || {}).fulfilled_at);
stripe.charges.ch_B = { id: 'ch_B', object: 'charge', invoice: 'in_B', amount: 3499, amount_refunded: 0 };
await send('charge.dispute.created', { id: 'dp_B', object: 'dispute', charge: 'ch_B' });
ok('a chargeback ends the plan (both games and the Arcade Card)',
  ['ps_premium', 'cfb_premium', 'arcade_card_year'].every((p) => !products(B).includes(p)));
ok('and the bonus already handed over is not taken back', products(B).includes('runtour_pack'));

console.log('\n-- the Arcade Card still runs through its own table');
subscription('sub_A', { user: A, bundle: undefined, price: 'price_arcade_monthly', end: now + 30 * DAY, newApi: true });
stripe.subscriptions.sub_A.metadata = { supabase_user_id: A };
await send('customer.subscription.updated', stripe.subscriptions.sub_A);
const arc = sql(`select to_json(s) from public.subscriptions s where user_id = '${A}'`);
ok('an Arcade Card event writes the Arcade table', !!arc);
ok('with its period end read off the item, never null', arc && JSON.parse(arc).current_period_end !== null);
ok('and writes no yearly plan', sql(`select count(*) from public.premium_subscriptions where user_id = '${A}'`) === '0');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (!KEEP) spawnSync('dropdb', ['--if-exists', '-f', DB]);
process.exit(failed ? 1 : 0);
