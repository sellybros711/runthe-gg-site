/* The page gate, as a pure function so the tests can drive it.
 *
 *   /last-shot              the page shell
 *   /last-shot/m/<file>.js  a browser module
 *
 * LAUNCHED. Anybody gets the page and its modules, signed in or not, and
 * nothing asks the database for them. Anything else (a server file, an
 * unknown path) is null, and the Pages Function turns that into the site's
 * 404 page.
 *
 * Until the launch it answered only a row in stumpire_testers. That list is
 * still what keeps the report to admins (roundGate below). */
import { PAGE, MODULES } from './pages.js';

export const ROLES = Object.freeze(['tester', 'admin']);

export function pageGate(sub) {
  const parts = String(sub || '').split('/').filter(Boolean);
  if (parts.length === 0) return { type: 'text/html; charset=utf-8', body: PAGE };
  if (parts.length === 2 && parts[0] === 'm' && MODULES[parts[1]] != null) return { type: 'text/javascript; charset=utf-8', body: MODULES[parts[1]] };
  return null;
}

/* THE ROUND'S TWO ROUTES, beside the page:
 *   POST /last-shot/e        a player's events (events.js)        -> 204
 *   GET  /last-shot/report   the report, admins only (report.js)
 * Anything else falls through to pageGate. A refusal is null, the same 404. */
import { postEvents, deviceOf, GAME } from './events.js';

/* Guests may send events. ON since the launch, so a player who never signs
   in still counts: an account, a good device id, or both. With it off the
   route is the tester round's: testers and admins only. */
export const PUBLIC_EVENTS = true;
import { renderReport, rangeOf } from './report.js';

export function isRound(sub) {
  const s = String(sub || '').replace(/\/+$/, '');
  return s === 'e' || s === 'report';
}

export async function roundGate({ method, sub, uid, query, body, nowMs, publicEvents = PUBLIC_EVENTS }, db) {
  if (!isRound(sub)) return undefined;
  const s = String(sub || '').replace(/\/+$/, '');
  if (s === 'e') {
    if (method !== 'POST') return null;
    if (publicEvents) {
      if (!uid && !deviceOf(body)) return null;
    } else {
      if (!uid) return null;
      let role = null;
      try { role = await db.role(uid); } catch (e) { return null; }
      if (!ROLES.includes(role)) return null;
    }
    const r = await postEvents(uid || null, body, db);
    return { status: r.status, type: 'text/plain; charset=utf-8', body: '' };
  }
  /* the report: admins only, whatever the game's posture */
  if (method !== 'GET' || !uid) return null;
  let role = null;
  try { role = await db.role(uid); } catch (e) { return null; }
  if (role !== 'admin') return null;
  const range = rangeOf(query || {}, nowMs);
  let r = null;
  try { r = await db.report(GAME, range.sinceAt, range.untilAt, !range.admins); } catch (e) { r = null; }
  return { status: 200, type: 'text/html; charset=utf-8', body: renderReport(r, range) };
}
