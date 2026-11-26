/* /api/pitch-guest  (Cloudflare Pages Function)
 *
 * A guest's finished Daily Challenge onto Run The Pitch's daily board under a
 * generated name, and, once that device signs in, the guest's days onto the
 * account. No Supabase anonymous sign-in is involved (supabase/189, and
 * functions/_pitchguest/core.js for the why).
 *
 *   POST { device, player_ids[11], progress, result, furthest, slots, theme }
 *        -> 200 { id, name, first }   id is the row's id on daily_board (negative for a guest);
 *                                     first is false when today was already on record
 *        -> 429 { error }             this IP has posted 3 new guest rows today
 *        -> 400 { error }             refused (not eleven known players, bad device)
 *   POST { action: 'season', device, draft_type, mode, won, drawn, lost, gf, ga, position, cup,
 *          overall, signings, player_ids, slots }      a guest's finished Club Season (supabase/191)
 *        -> 200 { id, name }           the row's id on club_season_board and the generated name
 *        -> 429 { error }              this IP has posted 20 guest seasons today
 *   POST { action: 'claim', device }  with the account's Authorization: Bearer
 *        -> 200 { moved }              the guest's Daily days and seasons, now the account's
 *
 * The score is never in the body: the database works it out from the ids.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE (and SUPABASE_ANON for verifyUser).
 * ARCADE_GUEST_SECRET is used for the keys when set; otherwise the service role.
 */
import { verifyUser } from './stripe/_verify.js';
import { secretOf, guestId, ipKey, readDaily, readSeason, readDevice, sameOrigin, rpc } from '../_pitchguest/core.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ error: 'not configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const raw = await request.text();
  if (raw.length > 4096) return json({ error: 'too large' }, 413);
  let body = null;
  try { body = JSON.parse(raw); } catch (e) { return json({ error: 'bad body' }, 400); }
  const secret = secretOf(env);

  if (body && body.action === 'claim') {
    const device = readDevice(body);
    if (!device) return json({ error: 'bad device' }, 400);
    const account = await verifyUser(env, request);
    if (!account) return json({ error: 'sign in' }, 401);
    const guest = await guestId(secret, device);
    // Two things a guest can have on a board: Daily days (189) and Club Seasons (191). Each
    // claim stands alone, so a database that has only one of the two migrations still claims it.
    const [d, s] = await Promise.all([
      rpc(env, 'soccer_daily_guest_claim', { p_account: account, p_guest: guest }),
      rpc(env, 'soccer_season_guest_claim', { p_account: account, p_guest: guest })
    ]);
    if (d.error && s.error) return json({ error: d.error }, 400);
    const days = (d.data && d.data.moved) || 0, seasons = (s.data && s.data.moved) || 0;
    return json({ moved: days, seasons, all: days + seasons });
  }

  if (body && body.action === 'season') {
    const run = readSeason(body);
    if (run.error) return json({ error: run.error }, 400);
    const key = await ipKey(secret, request.headers.get('CF-Connecting-IP'));
    const r = await rpc(env, 'soccer_season_guest_submit', Object.assign({ p_guest: await guestId(secret, run.device), p_ip_key: key }, run.args));
    if (r.error) return json({ error: r.error }, /guest limit/.test(r.error) ? 429 : 400);
    const d = r.data || {};
    return json({ id: d.id != null ? Number(d.id) : null, name: d.name || null });
  }

  const run = readDaily(body);
  if (run.error) return json({ error: run.error }, 400);
  const key = await ipKey(secret, request.headers.get('CF-Connecting-IP'));
  const r = await rpc(env, 'soccer_daily_guest_submit', Object.assign({ p_guest: await guestId(secret, run.device), p_ip_key: key }, run.args));
  if (r.error) return json({ error: r.error }, /guest limit/.test(r.error) ? 429 : 400);
  const d = r.data || {};
  // On daily_board a guest row's id is negative, so it never collides with an account row's.
  return json({ id: d.id != null ? -Number(d.id) : null, name: d.name || null, first: !!d.first });
}

export function onRequest() {
  return json({ error: 'method' }, 405);
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
