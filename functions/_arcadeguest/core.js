/* A guest's run on the arcade's daily board, with no Supabase anonymous
 * sign-in (185). The route is functions/api/arcade-guest.js; this file is the
 * part a test can run in Node.
 *
 * Files under a "_" folder are not routed by Cloudflare Pages.
 *
 * WHO A GUEST IS
 * The page keeps a random device id (a v4 uuid) in localStorage. The guest's
 * board id is derived from it with a server secret, so a browser can name only
 * its own guest id and can never pick a uuid that belongs to somebody else. The
 * database refuses any id an account holds all the same.
 *
 * THE CAP
 * The caller's IP is keyed with the same secret and never stored raw.
 * arcade_guest_submit allows 12 new guest rows per key per day.
 */

const enc = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GAMES = ['crossword', 'sportegories', 'almamater', 'career'];

export function secretOf(env) {
  return env.ARCADE_GUEST_SECRET || env.SUPABASE_SERVICE_ROLE || '';
}

async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/* The guest's board id: 16 bytes of HMAC, shaped as a v4 uuid. */
export async function guestId(secret, device) {
  const b = (await hmac(secret, 'arcade-guest-device:' + device)).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

export async function ipKey(secret, ip) {
  return hex(await hmac(secret, 'arcade-guest-ip:' + (ip || 'unknown'))).slice(0, 32);
}

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi);

/* The body a page sends, checked before anything reaches the database.
   Returns the RPC's arguments, or a reason it is refused. */
export function readRun(body) {
  if (!body || typeof body !== 'object') return { error: 'bad body' };
  const { device, game, date, seconds, mistakes, reveals } = body;
  const runLen = body.runLen == null ? null : body.runLen;
  if (typeof device !== 'string' || !UUID.test(device)) return { error: 'bad device' };
  if (!GAMES.includes(game)) return { error: 'not a free game' };
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'bad date' };
  if (!int(seconds, 0, 86399)) return { error: 'bad time' };
  if (!int(mistakes || 0, 0, 1000) || !int(reveals || 0, 0, 1000)) return { error: 'bad counts' };
  if (runLen !== null && !int(runLen, 0, 999)) return { error: 'bad run' };
  return { device, args: { p_game: game, p_date: date, p_seconds: seconds, p_mistakes: mistakes || 0, p_reveals: reveals || 0, p_run_len: runLen } };
}

export function readDevice(body) {
  const d = body && body.device;
  return (typeof d === 'string' && UUID.test(d)) ? d : null;
}

/* Same origin only: the page posts here; nothing else should. */
export function sameOrigin(request) {
  const o = request.headers.get('Origin');
  if (!o) return false;
  try { return new URL(o).host === new URL(request.url).host; } catch (e) { return false; }
}

export async function rpc(env, name, args, fetchFn = fetch) {
  const r = await fetchFn(env.SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  let data = null;
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) return { error: (data && data.message) || ('http ' + r.status) };
  return { data };
}
