/* /api/arcade-guest  (Cloudflare Pages Function)
 *
 * A guest's finished run onto the arcade's daily board, and, once that device
 * signs in, the guest's days onto the account. No Supabase anonymous sign-in
 * is involved (185, and functions/_arcadeguest/core.js for the why).
 *
 *   POST { device, game, date, seconds, mistakes, reveals, runLen }
 *        -> 200 { uid }            the guest's board id (the page names the row from it)
 *        -> 429 { error }          this IP has posted 12 new guest rows today
 *        -> 400 { error }          refused (not a free game, bad date, implausible)
 *   POST { action: 'claim', device }  with the account's Authorization: Bearer
 *        -> 200 { moved }
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE (and SUPABASE_ANON for verifyUser).
 * ARCADE_GUEST_SECRET is used for the keys when set; otherwise the service role.
 */
import { verifyUser } from './stripe/_verify.js';
import { secretOf, guestId, ipKey, readRun, readDevice, sameOrigin, rpc } from '../_arcadeguest/core.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ error: 'not configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const raw = await request.text();
  if (raw.length > 2048) return json({ error: 'too large' }, 413);
  let body = null;
  try { body = JSON.parse(raw); } catch (e) { return json({ error: 'bad body' }, 400); }
  const secret = secretOf(env);

  if (body && body.action === 'claim') {
    const device = readDevice(body);
    if (!device) return json({ error: 'bad device' }, 400);
    const account = await verifyUser(env, request);
    if (!account) return json({ error: 'sign in' }, 401);
    const r = await rpc(env, 'arcade_guest_claim', { p_account: account, p_guest: await guestId(secret, device) });
    if (r.error) return json({ error: r.error }, 400);
    return json({ moved: (r.data && r.data.moved) || 0 });
  }

  const run = readRun(body);
  if (run.error) return json({ error: run.error }, 400);
  const uid = await guestId(secret, run.device);
  const key = await ipKey(secret, request.headers.get('CF-Connecting-IP'));
  const r = await rpc(env, 'arcade_guest_submit', Object.assign({ p_guest: uid, p_ip_key: key }, run.args));
  if (r.error) return json({ error: r.error }, /guest limit/.test(r.error) ? 429 : 400);
  return json({ uid, id: r.data && r.data.id });
}

export function onRequest() {
  return json({ error: 'method' }, 405);
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
