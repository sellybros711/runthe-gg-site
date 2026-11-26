/* A guest's Daily Challenge on Run The Pitch's daily board, with no Supabase
 * anonymous sign-in (supabase/189). The route is functions/api/pitch-guest.js;
 * this file is the part a test can run in Node.
 *
 * Files under a "_" folder are not routed by Cloudflare Pages.
 *
 * The shape is the arcade's (functions/_arcadeguest/core.js, 185): the page keeps
 * a random device id, the guest's board id is an HMAC of it under a server
 * secret, and the caller's IP is keyed with the same secret and never stored
 * raw. The keys carry their own prefix, so a device is a different guest here
 * than in the arcade.
 *
 * THE SCORE IS NOT IN THE BODY. The page sends the eleven player ids and how
 * far the run went. soccer_daily_guest_submit works the score out from the ids.
 */
import { secretOf, readDevice, sameOrigin, rpc } from '../_arcadeguest/core.js';

export { secretOf, readDevice, sameOrigin, rpc };

const enc = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PLAYER = /^[A-Za-z0-9_.'\-]{3,80}$/;
const SLOTS = ['GK', 'DEF', 'MID', 'FWD', 'FLEX'];

async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/* The guest's board id: 16 bytes of HMAC, shaped as a v4 uuid. */
export async function guestId(secret, device) {
  const b = (await hmac(secret, 'pitch-guest-device:' + device)).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

export async function ipKey(secret, ip) {
  return hex(await hmac(secret, 'pitch-guest-ip:' + (ip || 'unknown'))).slice(0, 32);
}

const text = (v, max) => (typeof v === 'string' && v.length <= max) ? v : null;

/* The body a page sends, checked before anything reaches the database.
   Returns the RPC's arguments, or a reason it is refused. */
export function readDaily(body) {
  if (!body || typeof body !== 'object') return { error: 'bad body' };
  const { device, player_ids: ids, progress, slots } = body;
  if (typeof device !== 'string' || !UUID.test(device)) return { error: 'bad device' };
  if (!Array.isArray(ids) || ids.length !== 11 || !ids.every((x) => typeof x === 'string' && PLAYER.test(x))) return { error: 'bad squad' };
  if (new Set(ids).size !== 11) return { error: 'bad squad' };
  if (!Number.isInteger(progress) || progress < 0 || progress > 6) return { error: 'bad progress' };
  const okSlots = Array.isArray(slots) && slots.length === 11 && slots.every((s) => SLOTS.includes(s));
  return { device, args: {
    p_player_ids: ids, p_progress: progress,
    p_result: text(body.result, 40), p_furthest: text(body.furthest, 40),
    p_slots: okSlots ? slots : null, p_theme: text(body.theme, 40)
  } };
}

/* A guest's finished Club Season (supabase/191). The result is the page's word, as a draft's
   progress is; the database holds it to what a season can be. Checked here first so nothing
   malformed reaches it. Returns the RPC's arguments, or a reason it is refused. */
const POOL_ID = /^Q[0-9]{1,12}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export function readSeason(body) {
  if (!body || typeof body !== 'object') return { error: 'bad body' };
  const { device, draft_type: dt, mode, won, drawn, lost, gf, ga, position, cup, overall, signings, player_ids: ids, slots } = body;
  if (typeof device !== 'string' || !UUID.test(device)) return { error: 'bad device' };
  if (dt !== 'full' && dt !== 'quick') return { error: 'bad draft type' };
  if (mode !== 'easy' && mode !== 'hard') return { error: 'bad mode' };
  if (!int(won, 0, 9) || !int(drawn, 0, 9) || !int(lost, 0, 9) || won + drawn + lost !== 9) return { error: 'bad results' };
  if (!int(gf, 0, 63) || !int(ga, 0, 63)) return { error: 'bad goals' };
  if (!int(position, 1, 10)) return { error: 'bad position' };
  if (!['winner', 'finalist', 'semi', 'none'].includes(cup)) return { error: 'bad cup' };
  const size = dt === 'full' ? 11 : 6;
  if (!Array.isArray(ids) || ids.length !== size || new Set(ids).size !== size
      || !ids.every((x) => typeof x === 'string' && (PLAYER.test(x) || POOL_ID.test(x)))) return { error: 'bad squad' };
  if (typeof overall !== 'number' || !isFinite(overall)) return { error: 'bad rating' };
  const okSlots = Array.isArray(slots) && slots.length === size && slots.every((x) => SLOTS.includes(x));
  return { device, args: {
    p_draft_type: dt, p_mode: mode, p_won: won, p_drawn: drawn, p_lost: lost, p_gf: gf, p_ga: ga,
    p_position: position, p_cup: cup, p_overall: Math.round(overall * 10) / 10, p_signings: int(signings, 0, 2) ? signings : 0,
    p_player_ids: ids, p_slots: okSlots ? slots : null
  } };
}
