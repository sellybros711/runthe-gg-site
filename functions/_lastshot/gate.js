/* The round's two routes, as a pure function so the tests can drive it.
 *
 * LAUNCHED. The page and its modules are not here any more: since
 * 2026-11-19 they are static files in last-shot/ at the site root (built by
 * build/pages.mjs), served to anybody by Cloudflare Pages with no Function
 * and no database. This file answers only the two routes that are Functions
 * (functions/last-shot/e.js and report.js, through route.js).
 *
 * Until the launch the page went only to a row in stumpire_testers. That list
 * is still what keeps the report to admins (roundGate below). */

export const ROLES = Object.freeze(['tester', 'admin']);

/* THE ROUTES:
 *   POST /last-shot/e        a player's events (events.js)        -> 204
 *   GET  /last-shot/report   the report, admins only (report.js)
 * Anything else is undefined (not a route here). A refusal is null, the same 404. */
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
