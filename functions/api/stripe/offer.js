/* GET /api/stripe/offer -> { plan: "year" | "once" }
 *
 * What the store should draw: the football bundles sold yearly, or once. The answer is
 * _offer.js's, which is the same answer checkout-bundle.js acts on, so the page cannot
 * show a price the checkout will not charge. See _offer.js for what 'year' needs.
 *
 * No auth: it says which product is on sale, which is what the store already shows to
 * anybody. Never cached, because the moment it changes is launch day. A failure of any
 * kind answers 'once', which is the product that has always been on sale.
 */
import { currentPlan } from './_offer.js';

export async function onRequestGet(context) {
  let plan = 'once';
  try { plan = await currentPlan(context.env); } catch (e) { plan = 'once'; }
  return new Response(JSON.stringify({ plan: plan }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
