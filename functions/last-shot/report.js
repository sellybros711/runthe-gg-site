/* GET /last-shot/report  (Cloudflare Pages Function)
 *
 * The round's four targets, for an admin in stumpire_testers only (gate.js
 * roundGate). Anybody else, and any method but GET, gets exactly the 404
 * Stumpire gives a stranger (../_lastshot/route.js).
 *
 * This file answers /last-shot/report only. The page and its modules are
 * static files in last-shot/ at the site root, so they cost no invocation. */
import { answer } from '../_lastshot/route.js';

export function onRequest(context) {
  return answer(context, 'report');
}
