/* The gate, driven through the real Pages Function. Anybody who is not on the tester list gets exactly
 * what Stumpire gives a stranger, on every route but the sign in screen, and the sign in screen names
 * nothing. Supabase and GitHub are faked; ROLE says what the tester list holds for the signed in user. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sign } from '../../_stumpire/cookie.js';
import { MODULE_FILES } from '../build/pages.mjs';

const PAGE_404 = '<!doctype html><title>Page not found</title><p>404</p>';
let ROLE = 'tester', SB_DOWN = false;
globalThis.fetch = async (u, o = {}) => { u = String(u);
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: /Bearer good/.test((o.headers || {}).Authorization || '') ? 200 : 401 });
  if (u.includes('/rest/v1/stumpire_testers')) { if (SB_DOWN) return new Response('{}', { status: 500 }); return new Response(JSON.stringify(ROLE ? [{ role: ROLE }] : [])); }
  if (u.includes('api.github.com')) { const p = u.split('/repos/')[1];
    if (p.includes('git/trees')) return new Response(JSON.stringify({ tree: [{ path: 'football/CLAUDE.md', type: 'blob' }, { path: 'football/engine.js', type: 'blob' }, { path: 'scripts/newsletter/games.json', type: 'blob' }] }));
    if (p.includes('games.json')) return new Response(JSON.stringify({ games: [{ dir: 'football', name: 'The Perfect Season' }] }));
    return new Response('nf', { status: 404 }); }
  throw new Error('unexpected fetch ' + u); };
const { onRequest } = await import('../../skyworld/[[path]].js');
const ASSETS = { fetch: async u => { const p = new URL(String(u)).pathname; if (p === '/404.html') return new Response(PAGE_404); if (p === '/golf/index.html') return new Response('<script src="putt/putt.js?v=98"></script>'); return new Response('', { status: 404 }); } };
const ENV = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE: 'svc', SUPABASE_ANON: 'anon', SKY_GITHUB_TOKEN: 'gh', ASSETS };
const SECRET = 'stumpire-cookie-v1|svc';

async function req(path, { cookie, bearer, env = ENV } = {}) {
  const headers = {}; if (cookie) headers.Cookie = 'stmp=' + cookie; if (bearer) headers.Authorization = 'Bearer ' + bearer;
  const res = await onRequest({ request: new Request('https://runthe.gg/skyworld/' + path, { headers }), env, params: { path: path.split('/').filter(Boolean) } });
  return { status: res.status, body: await res.text(), headers: res.headers };
}
// every browser module (the one list, build/pages.mjs), every API route, and things that are not there
const MODULES = MODULE_FILES.map(f => 'm/' + f);
const WORLD = [...MODULES, 'api/world', 'api/ideas', 'api/me', 'api/nope', 'm/nope.js', 'nonsense', 'admin'];
function refused(r, path) {
  assert.equal(r.status, 404, path);
  if (path.split(' ').pop().startsWith('api/')) assert.deepEqual(JSON.parse(r.body), { error: 'not_found' }, path);
  else assert.equal(r.body, PAGE_404, path);
  assert.equal(r.headers.get('set-cookie'), null, path);
}

test('the sign in screen is the one thing anybody gets, and it names nothing', async () => {
  for (const p of ['', 'index.html']) {
    const r = await req(p); assert.equal(r.status, 200); assert.match(r.headers.get('x-robots-tag'), /noindex/);
    assert.match(r.body, /<title>RunThe\.GG<\/title>/);
    for (const w of [/sky\s+world/i, /agent/i, /perfect season|run the|segue|stumpire|mythiball|last shot|island/i]) assert.doesNotMatch(r.body, w);
  }
});

test('a guest, a bad cookie, an expired cookie and a signed in non-tester all get Stumpire\'s 404', async () => {
  const old = await sign(SECRET, 'u1', Date.now() - 13 * 3600 * 1000);
  const forged = (await sign(SECRET, 'u1', Date.now())).replace(/.$/, c => c === 'A' ? 'B' : 'A');
  for (const p of WORLD) {
    ROLE = 'tester';
    refused(await req(p), 'guest ' + p);
    refused(await req(p, { cookie: 'u1.9999999999.nope' }), 'garbage ' + p);
    refused(await req(p, { cookie: forged }), 'forged ' + p);
    refused(await req(p, { cookie: old }), 'expired ' + p);
    refused(await req(p, { bearer: 'bad' }), 'bad token ' + p);
    ROLE = null;
    refused(await req(p, { bearer: 'good' }), 'non-tester token ' + p);
    refused(await req(p, { cookie: await sign(SECRET, 'u1', Date.now()) }), 'non-tester cookie ' + p);
    ROLE = 'player';
    refused(await req(p, { cookie: await sign(SECRET, 'u1', Date.now()) }), 'unknown role ' + p);
  }
});

test('a tester and an admin sign in, get the cookie, and then the world', async () => {
  for (const role of ['tester', 'admin']) {
    ROLE = role;
    const me = await req('api/me', { bearer: 'good' });
    assert.equal(me.status, 200); assert.match(me.headers.get('set-cookie'), /^stmp=u1\.\d+\.[\w-]+; Path=\/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax$/);
    const cookie = me.headers.get('set-cookie').split(';')[0].slice(5);
    for (const m of MODULES) { const r = await req(m, { cookie }); assert.equal(r.status, 200, m); assert.match(r.headers.get('content-type'), /javascript/); }
    assert.ok((await req('m/boot.js', { cookie })).body.includes('var LOAD = ' + JSON.stringify(MODULE_FILES.slice(1)) + ';'), 'boot.js loads every module, in order');
    const w = await req('api/world', { cookie }); assert.equal(w.status, 200);
    const body = JSON.parse(w.body); assert.equal(body.games[0].name, 'The Perfect Season'); assert.equal(body.games[0].status, 'live'); assert.equal(body.art.putt, '98');
  }
});

test('taking somebody off the list takes the world away on the next request, with no deploy', async () => {
  ROLE = 'tester'; const cookie = await sign(SECRET, 'u1', Date.now());
  assert.equal((await req('m/world.js', { cookie })).status, 200);
  ROLE = null; refused(await req('m/world.js', { cookie }), 'removed m/world.js'); refused(await req('api/world', { cookie }), 'removed api/world');
  ROLE = 'tester'; SB_DOWN = true; refused(await req('m/world.js', { cookie }), 'database down m/world.js'); refused(await req('api/world', { cookie }), 'database down api/world'); SB_DOWN = false;
});

test('with no Supabase configured nothing past the sign in screen answers', async () => {
  ROLE = 'tester'; const env = { ASSETS };
  assert.equal((await req('', { env })).status, 200);
  for (const p of WORLD) refused(await req(p, { env, cookie: await sign(SECRET, 'u1', Date.now()), bearer: 'good' }), 'no env ' + p);
});

test('the refusal is Stumpire\'s own notFound(), byte for byte', () => {
  const fn = f => { const s = fs.readFileSync(new URL(f, import.meta.url), 'utf8'); const i = s.indexOf('async function notFound('); return s.slice(i, s.indexOf('\n}\n', i) + 2); };
  const mine = fn('../../skyworld/[[path]].js'), theirs = fn('../../arcade/stumpire/[[path]].js');
  assert.ok(theirs.length > 100); assert.equal(mine, theirs);
});
