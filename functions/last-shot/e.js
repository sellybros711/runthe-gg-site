/* POST and GET /last-shot/e  (Cloudflare Pages Function)
 *
 * A player's gameplay events (analytics.js sends them): an account, a guest
 * with a good device id, or both, get 204 (gate.js roundGate, PUBLIC_EVENTS).
 * GET is the probe analytics.js asks first: { on } for this visitor's country.
 * Any other method or caller gets Stumpire's 404 (../_lastshot/route.js).
 *
 * This file answers /last-shot/e only. The page and its modules are static
 * files in last-shot/ at the site root, so they cost no invocation. */
import { answer } from '../_lastshot/route.js';

export function onRequest(context) {
  return answer(context, 'e');
}
