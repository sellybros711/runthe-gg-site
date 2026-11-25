/* Run The Course: first party events, cleaned before they are stored.
 *
 * POST /api/course/e  { s: session id, d: device id, ev: [{ n, t, p }] }  ->  204
 * GET  /api/course/e  the probe: may this visitor send events at all  ->  { on }
 *
 * Only the names below, only their props, only small values. Anything else in
 * a batch is dropped, never stored. A bad body stores nothing.
 *
 * NO EVENTS FROM THE EU, THE UK OR SWITZERLAND until the site has a consent
 * banner (the owner, 2026-11-23). The list is the site's own GA4 consent
 * region list (404.html and every page's gtag consent default);
 * course/test/save.test.mjs holds the two equal. No country at all (local dev, tests) counts as allowed. */
export const GAME = 'course';
export const MAX_EVENTS = 40;

const bool = v => (typeof v === 'boolean' ? v : undefined);
const int = (lo, hi) => v => (Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const str = re => v => (typeof v === 'string' && v.length <= 24 && re.test(v) ? v : undefined);

export const EVENTS = Object.freeze({
  open: { first: bool, signed: bool },
  shift_start: { no: int(1, 100000) },
  shift_end: { no: int(1, 100000), rounds: int(0, 1000), cash: int(-100000, 10000000), tips: int(0, 10000000), walk_offs: int(0, 1000), goal_met: bool, stuck: int(0, 1000) },
  goal_step: { key: str(/^[a-z0-9]+$/), no: int(1, 100000) },
  pad_buy: { id: str(/^[a-z0-9_]+$/) },
  upgrade: { id: str(/^[a-z0-9_]+$/), level: int(1, 100) }
});

export const NO_EVENTS = Object.freeze(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH']);
export function allowed(country) {
  return !(typeof country === 'string' && NO_EVENTS.includes(country.trim().toUpperCase()));
}

const ID = /^[A-Za-z0-9-]{8,40}$/;
export function cleanBatch(body) {
  if (!body || typeof body !== 'object' || !ID.test(body.s || '') || !Array.isArray(body.ev)) return null;
  const rows = [];
  for (const e of body.ev.slice(0, MAX_EVENTS)) {
    const spec = e && typeof e === 'object' && Object.prototype.hasOwnProperty.call(EVENTS, e.n) ? EVENTS[e.n] : null;
    if (!spec || !Number.isInteger(e.t) || e.t < 0 || e.t > 2147483647) continue;
    const props = {};
    for (const k in spec) { const v = spec[k](e.p ? e.p[k] : undefined); if (v !== undefined) props[k] = v; }
    rows.push({ session_id: body.s, name: e.n, client_ms: e.t, props });
  }
  if (!rows.length) return null;
  return { device: typeof body.d === 'string' && ID.test(body.d) ? body.d : null, rows };
}
export async function readBody(request, max) {
  try { const t = await request.text(); if (t.length > max) return null; return JSON.parse(t); } catch (e) { return null; }
}
export function sameOrigin(request) {
  const o = request.headers.get('Origin');
  if (!o) return true;
  try { return new URL(o).host === new URL(request.url).host; } catch (e) { return false; }
}
