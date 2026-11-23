/* 4TH AND WHAT'S LAUNCH EVENTS, the server half (the owner, 2026-11-14: "use
 * the Supabase table"). The launch plan's soft launch is judged on snaps a
 * session, new players finishing a run, sessions that share or save, the time
 * to the first snap and the day 1 return; supabase/171 faw_round_report counts
 * them from these rows in the shared game_events (170).
 *
 * The game is public and most players never sign in, so a row carries a
 * device id (a random id the page keeps in its own storage), never anything
 * personal. Nothing third party, no cookie.
 *
 * POST /api/faw/e  { d: device id, s: session id, ev: [{ n, t, p }] }  ->  204
 * Only the names below, only their props, only small values. Anything else in
 * a batch is dropped, never stored. A bad body stores nothing. */

export const MAX_EVENTS = 40;
export const MAX_PROPS = 600;
const ID = /^[A-Za-z0-9-]{8,40}$/;

const bool = v => (typeof v === 'boolean' ? v : undefined);
const int = (lo, hi) => v => (Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const oneOf = (...xs) => v => (xs.includes(v) ? v : undefined);

/* Each event's props: key -> cleaner. A key not listed is dropped. */
export const EVENTS = Object.freeze({
  open: { first: bool, entry: oneOf('home', 'play', 'call', 'daily', 'coach', 'other') },
  snap: { mode: oneOf('go', 'today', 'practice', 'daily'), card: oneOf('run', 'quick', 'shot', 'mine', 'own'), win: bool,
    outcome: oneOf('down', 'touchdown', 'incomplete', 'interception', 'sack', 'throwaway', 'fumble', 'safety', 'oob'),
    shell: oneOf('two', 'one', 'zero'), distance: int(1, 99) },
  run_start: { daily: bool },
  run_end: { daily: bool, converted: int(0, 200), yards: int(0, 20000) },
  share: { kind: oneOf('video', 'line', 'run') },
  save: { kind: oneOf('play', 'card') },
  daily_open: { played: bool },
  coach_open: { tool: oneOf('hub', 'studio', 'learn', 'books', 'test', 'print') }
});

/* { device, rows } to store, or null for anything that is not a well formed batch. */
export function cleanBatch(body) {
  if (!body || typeof body !== 'object') return null;
  const d = body.d, s = body.s;
  if (typeof d !== 'string' || !ID.test(d) || typeof s !== 'string' || !ID.test(s) || !Array.isArray(body.ev)) return null;
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
  return { device: d, rows };
}

/* The body of a POST, whether fetch sent JSON or sendBeacon sent text. */
export async function readBody(request) {
  try {
    const text = await request.text();
    if (!text || text.length > 40000) return null;
    return JSON.parse(text);
  } catch (e) { return null; }
}

/* A post from another site is not ours to store (a beacon carries Origin). */
export function sameOrigin(request) {
  const o = request.headers.get('Origin');
  if (!o) return true;
  try { return new URL(o).host === new URL(request.url).host; } catch (e) { return false; }
}

/* Store a clean batch through supabase/171 faw_events_add (it caps a device
   at a day's rows). Never throws: a failed write is dropped. */
export async function store(env, batch, fetchFn = fetch) {
  if (!batch || !batch.rows.length || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return 0;
  try {
    const r = await fetchFn(env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/faw_events_add', {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_device: batch.device, p_rows: batch.rows })
    });
    return r.ok ? 1 : 0;
  } catch (e) { return 0; }
}
