/* The gate. Last Shot answers a non-tester exactly as Stumpire does: the
 * site's 404 page, status 404, no-store. These drive the real Pages
 * Functions (Last Shot's and Stumpire's) side by side against a fake
 * Supabase, so "exactly" is measured, not claimed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render, MODULE_FILES } from '../build/pages.mjs';
import { PAGE, MODULES } from '../pages.js';
import { pageGate } from '../gate.js';
import { memoryDb } from '../db-supabase.js';
import { sign, COOKIE } from '../../_stumpire/cookie.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(ROOT, '../..');
const fnUrl = p => pathToFileURL(path.join(REPO, p)).href;
const LAST = (await import(fnUrl('functions/last-shot/[[path]].js'))).onRequest;
const STUMP = (await import(fnUrl('functions/arcade/stumpire/[[path]].js'))).onRequest;
const NOT_FOUND_HTML = fs.readFileSync(path.join(REPO, '404.html'), 'utf8');

test('pages.js is up to date with its sources', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'pages.js'), 'utf8'), render(), 'run node functions/_lastshot/build/pages.mjs');
});

test('a tester and an admin get the page and every browser module', async () => {
  const db = memoryDb({ t: 'tester', a: 'admin' });
  for (const uid of ['t', 'a']) {
    const page = await pageGate('', uid, db);
    assert.equal(page.body, PAGE);
    assert.match(page.type, /text\/html/);
    for (const f of MODULE_FILES) assert.equal((await pageGate('m/' + f, uid, db)).body, MODULES[f], f);
  }
});

test('nobody else gets anything', async () => {
  const db = memoryDb({ t: 'tester', p: 'player', x: 'banned' });
  for (const uid of [null, undefined, '', 'stranger', 'p', 'x']) {
    assert.equal(await pageGate('', uid, db), null, String(uid));
    assert.equal(await pageGate('m/sim.js', uid, db), null, String(uid));
  }
  const broken = { async role() { throw new Error('down'); } };
  assert.equal(await pageGate('', 't', broken), null, 'a database error is a refusal');
});

test('server files and unknown paths are never served, even to a tester', async () => {
  const db = memoryDb({ t: 'tester' });
  for (const sub of ['m/gate.js', 'm/db-supabase.js', 'm/pages.js', 'm/../gate.js', 'admin', 'x', 'm', 'm/', 'm/sim.js/x', 'web/play.html', 'build/pages.mjs'])
    assert.equal(await pageGate(sub, 't', db), null, sub);
  for (const f of ['gate.js', 'db-supabase.js', 'pages.js']) assert.ok(!(f in MODULES), f + ' is not a browser module');
});

test('the page is noindexed, names who it is for, and loads only gated modules', () => {
  assert.match(PAGE, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(PAGE, /TESTERS ONLY/);
  assert.ok(PAGE.includes('/last-shot/m/client.js'));
  for (const [f, src] of Object.entries(MODULES)) for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
    const to = path.posix.normalize(m[1]).replace(/^\.\//, '');
    assert.ok(MODULES[to] != null, f + ' imports ' + to + ', which is not served');
  }
});

/* ---------- the two Pages Functions, side by side ---------- */
const SECRET_ENV = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE: 'service-key' };
const SECRET = 'stumpire-cookie-v1|service-key';

/* A fake Supabase: testers by user id, Stumpire's mode 'testers'. */
function fakeSupabase(testers) {
  return async (url, init) => {
    const u = new URL(url);
    const body = (x) => new Response(JSON.stringify(x), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname.endsWith('/stumpire_testers')) {
      const id = (u.searchParams.get('user_id') || '').replace(/^eq\./, '');
      return body(testers[id] ? [{ role: testers[id] }] : []);
    }
    if (u.pathname.endsWith('/stumpire_settings')) return body([{ value: 'testers' }]);
    if (u.pathname.endsWith('/rpc/stumpire_access')) {
      const id = JSON.parse(init.body).p_uid;
      return body(testers[id] === 'admin' ? 'admin' : testers[id] ? 'tester' : null);
    }
    return new Response('[]', { status: 404 });
  };
}

function ctx(url, env, cookie) {
  const headers = new Headers(cookie ? { Cookie: COOKIE + '=' + cookie } : {});
  const sub = new URL(url).pathname.replace(/^\/(last-shot|arcade\/stumpire)\/?/, '');
  return {
    request: new Request(url, { headers }), env: { ...env, ASSETS: { fetch: async () => new Response(NOT_FOUND_HTML, { status: 200 }) } },
    params: { path: sub ? sub.split('/') : [] }
  };
}

async function snap(res) {
  return { status: res.status, type: res.headers.get('Content-Type'), cache: res.headers.get('Cache-Control'), robots: res.headers.get('X-Robots-Tag'), body: await res.text() };
}

test('a non-tester gets exactly the answer Stumpire gives them', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = fakeSupabase({ tess: 'tester' });
  try {
    const now = Date.now();
    const cases = [
      ['no database configured', {}, null],
      ['signed out, no cookie', SECRET_ENV, null],
      ['a forged cookie', SECRET_ENV, 'stranger.' + (Math.floor(now / 1000) + 99) + '.AAAA'],
      ['signed in, not a tester', SECRET_ENV, await sign(SECRET, 'stranger', now)],
      ['an expired tester cookie', SECRET_ENV, await sign(SECRET, 'tess', now - 13 * 3600 * 1000)]
    ];
    for (const [name, env, cookie] of cases) {
      const a = await snap(await LAST(ctx('https://runthe.gg/last-shot', env, cookie)));
      const b = await snap(await STUMP(ctx('https://runthe.gg/arcade/stumpire/', env, cookie)));
      assert.equal(a.status, 404, name);
      assert.deepEqual(a, b, name + ': Last Shot and Stumpire differ');
      assert.equal(a.body, NOT_FOUND_HTML, name + ': the site 404 page');
      const m = await snap(await LAST(ctx('https://runthe.gg/last-shot/m/sim.js', env, cookie)));
      assert.deepEqual(m, b, name + ': a module is refused the same way');
    }
  } finally { globalThis.fetch = real; }
});

test('a tester with the signed cookie gets the page, never cached or indexed', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = fakeSupabase({ tess: 'tester' });
  try {
    const cookie = await sign(SECRET, 'tess', Date.now());
    const a = await snap(await LAST(ctx('https://runthe.gg/last-shot', SECRET_ENV, cookie)));
    assert.equal(a.status, 200);
    assert.equal(a.body, PAGE);
    assert.equal(a.cache, 'no-store');
    assert.equal(a.robots, 'noindex, nofollow');
    const m = await snap(await LAST(ctx('https://runthe.gg/last-shot/m/sim.js', SECRET_ENV, cookie)));
    assert.equal(m.status, 200); assert.match(m.type, /javascript/); assert.equal(m.body, MODULES['sim.js']);
  } finally { globalThis.fetch = real; }
});
