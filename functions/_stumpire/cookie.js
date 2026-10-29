/* The page gate's cookie. The game's HTML is served by a Pages Function, and
 * a navigation carries no bearer token, so /api/stumpire/me (which does see
 * the token) hands a tester a signed, short-lived cookie naming their user
 * id. The page function checks the signature AND asks the database again, so
 * a tester removed from the table loses the page on their next load.
 * The key is STUMPIRE_COOKIE_SECRET when that is set, and otherwise one
 * derived from SUPABASE_SERVICE_ROLE, which the site already holds as a
 * secret: nothing to configure, and nobody without the service key can mint
 * a cookie. With neither, nothing verifies and every page is a 404. */
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

export const COOKIE = 'stmp';

export function secretOf(env) {
  if (!env) return null;
  if (env.STUMPIRE_COOKIE_SECRET) return env.STUMPIRE_COOKIE_SECRET;
  return env.SUPABASE_SERVICE_ROLE ? 'stumpire-cookie-v1|' + env.SUPABASE_SERVICE_ROLE : null;
}
export const TTL_S = 12 * 3600;

export async function sign(secret, uid, nowMs) {
  const exp = Math.floor(nowMs / 1000) + TTL_S;
  const body = uid + '.' + exp;
  return body + '.' + await hmac(secret, body);
}

export async function verify(secret, value, nowMs) {
  if (!secret || !value) return null;
  const parts = String(value).split('.');
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  if (!(Number(exp) > nowMs / 1000)) return null;
  const want = await hmac(secret, uid + '.' + exp);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? uid : null;
}

export function readCookie(request, name = COOKIE) {
  const h = request.headers.get('Cookie') || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setCookie(value) {
  return COOKIE + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + TTL_S + '; HttpOnly; Secure; SameSite=Lax';
}
