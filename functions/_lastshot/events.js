/* THE TESTER ROUND'S EVENTS (Phase 4 of the launch plan, 2026-11-13).
 *
 * The game stays tester only until a two week round hits four numbers:
 * median time to first Run It under 20 s, 60% of new players winning within
 * 5 tries, 6 tries a session, and a day 1 return of 25%. These events are
 * what the report (report.js, supabase/170) counts them from.
 *
 * FIRST PARTY ON PURPOSE. Testers are signed in, so a row per event keyed to
 * the account gives exact numbers that GA4's sampling, consent and the robot
 * it once counted for two weeks cannot. Nothing third party, no cookie of its
 * own: the account comes from the gate's signed cookie, server side, so a
 * browser cannot write rows for somebody else.
 *
 * POST /last-shot/e  { s: session id, ev: [{ n, t, p }] }  ->  204
 * Only the names below, only their props, only small values. Anything else
 * in a batch is dropped, never stored. A bad body stores nothing. */

export const GAME = 'last-shot';
export const MAX_EVENTS = 40;
export const MAX_PROPS = 600;

const str = (max, re) => v => (typeof v === 'string' && v.length <= max && (!re || re.test(v)) ? v : undefined);
const bool = v => (typeof v === 'boolean' ? v : undefined);
const int = (lo, hi) => v => (Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const num = (lo, hi) => v => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : undefined);
const oneOf = (...xs) => v => (xs.includes(v) ? v : undefined);
const level = str(4, /^[1-4]-[1-6]$/);
const MODE = oneOf('free', 'level', 'practice', 'daily', 'beat', 'edit');

/* Each event's props: key -> cleaner. A key not listed is dropped. */
export const EVENTS = Object.freeze({
  open: { first: bool, entry: oneOf('home', 'daily', 'beat') },
  run: { mode: MODE, level, n: int(1, 100000) },
  result: { mode: MODE, outcome: oneOf('win', 'lose'), how: str(12, /^[a-z]+$/), stars: int(0, 3), level, look: num(0, 1) },
  level_open: { level },
  daily_open: { played: bool },
  daily_filed: { score: int(0, 2000) },
  plays_load: { starter: str(20, /^[a-z-]+$/) },
  save: { mode: MODE },
  share: { kind: oneOf('result', 'daily', 'beat') },
  beat_open: { ok: bool }
});

/* The rows to store, or [] for anything that is not a well formed batch. */
export function cleanBatch(body) {
  if (!body || typeof body !== 'object') return [];
  const s = body.s;
  if (typeof s !== 'string' || !/^[A-Za-z0-9-]{8,40}$/.test(s) || !Array.isArray(body.ev)) return [];
  const rows = [];
  for (const e of body.ev.slice(0, MAX_EVENTS)) {
    if (!e || typeof e !== 'object' || !Object.prototype.hasOwnProperty.call(EVENTS, e.n)) continue;
    const t = int(0, 7 * 24 * 3600 * 1000)(e.t);
    if (t === undefined) continue;
    const spec = EVENTS[e.n], p = {};
    const src = e.p && typeof e.p === 'object' && !Array.isArray(e.p) ? e.p : {};
    if (JSON.stringify(src).length > MAX_PROPS) continue;
    for (const k of Object.keys(spec)) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      const v = spec[k](src[k]);
      if (v !== undefined) p[k] = v;
    }
    rows.push({ name: e.n, session_id: s, client_ms: t, props: p });
  }
  return rows;
}

/* POST /last-shot/e for a gated caller. Never throws: a store error is a 204
   all the same, so a flaky write never shows in the game. */
export async function postEvents(uid, body, db) {
  const rows = cleanBatch(body);
  if (rows.length) {
    try { await db.insertEvents(rows.map(r => ({ ...r, user_id: uid, game: GAME }))); } catch (e) { /* dropped */ }
  }
  return { status: 204 };
}

/* The body of a POST, whether fetch sent JSON or sendBeacon sent text. */
export async function readBody(request) {
  try {
    const text = await request.text();
    if (!text || text.length > 40000) return null;
    return JSON.parse(text);
  } catch (e) { return null; }
}
