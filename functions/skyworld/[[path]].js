/* /skyworld/*  (Cloudflare Pages Function)
 *
 * The Sky World: every game and every agent, for testers only (functions/_skyworld/README.md).
 *
 *   /skyworld/            the sign in screen. The one thing anybody can load; it names nothing.
 *   /skyworld/api/me      the player's token in, the page cookie out, for a tester only
 *   /skyworld/api/world   the world, for a tester's cookie only
 *   /skyworld/api/ideas   the Advisor Agent's suggestions, for a tester's cookie only
 *   /skyworld/api/agents, agent, tasks, task (POST)   the agents and their tasks, for a tester's cookie only
 *   /skyworld/m/<file>    the world's browser modules, for a tester's cookie only
 *
 * Everything but the sign in screen answers a non-tester exactly as Stumpire does: the site's own
 * 404 page (or {"error":"not_found"} for the API), status 404. The cookie is Stumpire's, so one
 * sign in opens every tester page. The tester list is asked again on every request.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_ANON, SKY_GITHUB_TOKEN, and SKY_VAULT_TOKEN for tasks.
 */
import { verifyUser } from '../api/stripe/_verify.js';
import { verify, sign, readCookie, setCookie, secretOf } from '../_stumpire/cookie.js';
import { supabaseDb, isTester } from '../_skyworld/db.js';
import { handle } from '../_skyworld/api.js';
import { buildWorld, artVersions } from '../_skyworld/world.js';
import { ideas } from '../_skyworld/ideas.js';
import { readAgents, githubAgents, registry, lastRuns } from '../_skyworld/agents.js';
import { queueTask, listTasks } from '../_skyworld/tasks.js';
import { SHELL, MODULES } from '../_skyworld/pages.js';

const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export async function onRequest(context) {
  const { request, env, params } = context;
  const parts = Array.isArray(params.path) ? params.path : String(params.path || '').split('/').filter(Boolean);
  const sub = parts.join('/');
  if (sub === '' || sub === 'index.html') return new Response(SHELL, { headers: HTML });
  if (parts[0] === 'api') return api(context, parts.slice(1).join('/'));
  if (parts[0] === 'm' && Object.hasOwn(MODULES, parts.slice(1).join('/'))) {
    let ok = false;
    try {
      if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE) {
        const uid = await verify(secretOf(env), readCookie(request), Date.now());
        ok = !!uid && isTester(await supabaseDb(env).role(uid));
      }
    } catch (e) { ok = false; }
    if (ok) return new Response(MODULES[parts.slice(1).join('/')], { headers: { ...HTML, 'Content-Type': 'text/javascript; charset=utf-8' } });
  }
  return notFound(context);
}

async function api(context, path) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers });
  let res;
  try {
    const bearerUid = path === 'me' ? await verifyUser(env, request) : null;
    const cookieUid = path === 'me' ? null : await verify(secretOf(env), readCookie(request), Date.now());
    let body = null; if (request.method === 'POST') { if (!/json/.test(request.headers.get('Content-Type') || '')) throw new Error('json only'); body = await request.json(); }
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const need = () => { if (!env.SKY_GITHUB_TOKEN) throw new Error('no token'); };
    const cached = async (k, ttl, make) => { const c = globalThis.caches && caches.default, key = 'https://skyworld.cache/' + k;
      if (c) { const hit = await c.match(key); if (hit) return hit.json(); } const v = await make();
      if (c) await c.put(key, new Response(JSON.stringify(v), { headers: { 'Cache-Control': 'max-age=' + ttl } })); return v; };
    res = await handle({ method: request.method, path, bearerUid, cookieUid, query, body }, {
      db: supabaseDb(env),
      world: async () => {
        if (!env.SKY_GITHUB_TOKEN) throw new Error('no token');
        const [w, art] = await Promise.all([buildWorld(env), artVersions(p => env.ASSETS.fetch(new URL(p, request.url)))]);
        return { ...w, art };
      },
      ideas: async () => { need(); return ideas(env); },
      agents: async () => { need(); return cached('agents/v1', 180, async () => { const w = await buildWorld(env); return { fetchedAt: new Date().toISOString(), ...(await readAgents(githubAgents(env), w.games)) }; }); },
      agent: async id => { need(); return cached('agent/' + id, 600, async () => { const s = githubAgents(env); return { id, runs: lastRuns(await s.vaultFile('agents/' + id + '/' + id + '-log.md')) }; }); },
      agentIds: async () => { need(); return cached('agent-ids/v1', 600, async () => { const s = githubAgents(env); return registry(await s.siteTree(), await s.vaultTree()).map(a => a.id); }); },
      canTask: () => !!env.SKY_VAULT_TOKEN,
      tasks: () => listTasks(env),
      queue: t => queueTask(env, t)
    });
  } catch (e) { res = { status: 404, body: { error: 'not_found' } }; }
  if (res.mint && secretOf(env)) headers['Set-Cookie'] = setCookie(await sign(secretOf(env), res.mint, Date.now()));
  return new Response(JSON.stringify(res.body), { status: res.status, headers });
}

async function notFound(context) {
  let html = 'Not found';
  try { const r = await context.env.ASSETS.fetch(new URL('/404.html', context.request.url)); if (r.ok) html = await r.text(); } catch (e) {}
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
