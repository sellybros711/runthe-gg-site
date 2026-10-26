/* What /last-shot answers, as a pure function so the tests can drive it.
 *
 *   /last-shot              the page shell
 *   /last-shot/m/<file>.js  a browser module
 *
 * OPEN TO ANYBODY WITH THE LINK (the owner's call, 2026-10-26). Last Shot was
 * tester-only behind stumpire_testers until then. It is still UNLISTED: no
 * nav, home page card, sitemap line or newsletter entry, and the page is
 * noindexed. check-posture.mjs holds that.
 *
 * Anything else under /last-shot (a server file, a typo) is null, and the
 * Pages Function turns that into the site's 404 page. */
import { PAGE, MODULES } from './pages.js';

export function serve(sub) {
  const parts = String(sub || '').split('/').filter(Boolean);
  if (parts.length === 0) return { type: 'text/html; charset=utf-8', body: PAGE };
  if (parts.length === 2 && parts[0] === 'm' && Object.hasOwn(MODULES, parts[1])) return { type: 'text/javascript; charset=utf-8', body: MODULES[parts[1]] };
  return null;
}
