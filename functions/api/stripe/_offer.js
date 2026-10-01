/* WHICH WAY THE TWO FOOTBALL BUNDLES ARE SOLD RIGHT NOW: 'year' or 'once'.
 *
 * One answer, asked by the page (through /api/stripe/offer, to draw the store) and by
 * checkout-bundle.js (to decide what Stripe is asked for). Two copies of this decision
 * would be a page showing one price and a checkout charging another.
 *
 * 'year' needs all three of these, and anything short of that is 'once':
 *
 *   YEARLY_LIVE          the switch in _bundles.js, on since launch
 *   the two price vars   STRIPE_PRICE_PS_YEAR and STRIPE_PRICE_RTB_YEAR
 *   the database         premium_yearly_ready() from supabase/124_premium_yearly.sql
 *
 * THE DATABASE IS ASKED, NOT ASSUMED, because SQL is deployed by hand and this code by
 * a push. A plan sold against a database without 124 would be a charge the webhook has
 * nowhere to record, so an unreachable or older database keeps selling the one-time
 * bundles, which it can record.
 *
 * Private module (the "_" prefix): not routed by Cloudflare Pages.
 */
import { YEARLY_LIVE, BUNDLES } from './_bundles.js';

export async function yearlyReady(env) {
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return false;
  try {
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/premium_yearly_ready', {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    if (!r.ok) return false;
    const v = await r.json().catch(function () { return null; });
    return Number(v) >= 1;
  } catch (e) { return false; }
}

export async function currentPlan(env) {
  if (!YEARLY_LIVE) return 'once';
  const prices = Object.values(BUNDLES).filter(function (b) { return b.year; })
    .every(function (b) { return !!(env && env[b.year.envPrice]); });
  if (!prices) return 'once';
  return (await yearlyReady(env)) ? 'year' : 'once';
}
