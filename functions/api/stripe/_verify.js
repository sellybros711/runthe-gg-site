/* Shared auth verification for the Stripe Pages Functions.
 *
 * Files prefixed with "_" are NOT routed by Cloudflare Pages, so this is a
 * private helper, not an endpoint.
 *
 * The billing endpoints must never trust a client-supplied user_id: knowing
 * someone's Supabase UUID (they leak via public leaderboard reads) would
 * otherwise let anyone open that person's Stripe portal or start checkout as
 * them. Instead the browser sends its Supabase session as `Authorization:
 * Bearer <access_token>` and we resolve the real user id from Supabase's
 * /auth/v1/user, which validates the JWT signature and expiry for us.
 *
 * Returns the authenticated user id (string) or null. Callers MUST 401 on null
 * and use the returned id — never the request body.
 */
export async function verifyUser(env, request) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return null;
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const jwt = m[1].trim();
  // Never accept the project keys themselves as a "user" token.
  if (!jwt || jwt === env.SUPABASE_SERVICE_ROLE || jwt === env.SUPABASE_ANON) return null;
  try {
    const r = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + jwt }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return (u && typeof u.id === 'string' && u.id) ? u.id : null;
  } catch (e) { return null; }
}
