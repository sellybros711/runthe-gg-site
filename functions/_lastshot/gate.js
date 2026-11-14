/* The page gate, as a pure function so the tests can drive it.
 *
 *   /last-shot              the page shell
 *   /last-shot/m/<file>.js  a browser module
 *
 * WHO GETS IN: anybody with a row in stumpire_testers (role 'tester' or
 * 'admin'), the one tester list every tester-only game uses. It reads the row
 * itself rather than calling stumpire_access(), because that function follows
 * Stumpire's own mode switch: taking Stumpire public would quietly take this
 * game public too. Last Shot has no flag of its own and needs none.
 *
 * Anybody refused gets null, and the Pages Function turns that into the
 * site's 404 page. */
import { PAGE, MODULES } from './pages.js';

export const ROLES = Object.freeze(['tester', 'admin']);

export async function pageGate(sub, uid, db) {
  const parts = String(sub || '').split('/').filter(Boolean);
  let out = null;
  if (parts.length === 0) out = { type: 'text/html; charset=utf-8', body: PAGE };
  else if (parts.length === 2 && parts[0] === 'm' && MODULES[parts[1]] != null) out = { type: 'text/javascript; charset=utf-8', body: MODULES[parts[1]] };
  if (!out || !uid) return null;
  let role = null;
  try { role = await db.role(uid); } catch (e) { return null; }
  return ROLES.includes(role) ? out : null;
}

/* THE TESTER ROUND (Phase 4). Two routes beside the page, behind the same
 * list, refused with the same 404:
 *   POST /last-shot/e        a tester's events (events.js)        -> 204
 *   GET  /last-shot/report   the round report, admins only (report.js)
 * Anything else falls through to pageGate. */
import { postEvents, GAME } from './events.js';
import { renderReport, rangeOf } from './report.js';

export async function roundGate({ method, sub, uid, query, body, nowMs }, db) {
  const s = String(sub || '').replace(/\/+$/, '');
  if (s !== 'e' && s !== 'report') return undefined;
  if (!uid) return null;
  let role = null;
  try { role = await db.role(uid); } catch (e) { return null; }
  if (s === 'e') {
    if (method !== 'POST' || !ROLES.includes(role)) return null;
    const r = await postEvents(uid, body, db);
    return { status: r.status, type: 'text/plain; charset=utf-8', body: '' };
  }
  if (method !== 'GET' || role !== 'admin') return null;
  const range = rangeOf(query || {}, nowMs);
  let r = null;
  try { r = await db.report(GAME, range.sinceAt, range.untilAt, !range.admins); } catch (e) { r = null; }
  return { status: 200, type: 'text/html; charset=utf-8', body: renderReport(r, range) };
}
