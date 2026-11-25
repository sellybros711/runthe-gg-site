/* /api/course/*  (Cloudflare Pages Function)
 *
 * The server side of Run The Course's saves and events. The game itself is
 * a plain public folder (course/), unlisted until launch; this route is the
 * only server code it has. functions/_course/api.js is the logic, as pure
 * functions the tests drive.
 *
 * WHO IS ASKING comes from the Supabase session the browser sends as
 * Authorization: Bearer, resolved by Supabase's own /auth/v1/user (the same
 * rule as functions/api/stripe/_verify.js). A user id in a body is never
 * trusted. Events may come from a guest, keyed by a device id. */
import { handle, MAX_BODY } from '../../_course/api.js';
import { readBody, sameOrigin } from '../../_course/events.js';
import { supabaseDb } from '../../_course/db-supabase.js';
import { verifyUser } from '../stripe/_verify.js';

export async function onRequest({ request, env, params }) {
  const sub = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  const head = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  let out = { status: 503, json: { error: 'unavailable' } };
  try {
    if (!sameOrigin(request)) out = { status: 403, json: { error: 'origin' } };
    else if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE) {
      const uid = await verifyUser(env, request);
      const body = request.method === 'POST' ? await readBody(request, MAX_BODY) : null;
      out = await handle({ method: request.method, sub, uid, body, query: Object.fromEntries(new URL(request.url).searchParams),
        country: request.cf && request.cf.country }, supabaseDb(env));
    }
  } catch (e) { out = { status: 503, json: { error: 'unavailable' } }; }
  return new Response(out.json === null ? null : JSON.stringify(out.json), { status: out.status, headers: head });
}
