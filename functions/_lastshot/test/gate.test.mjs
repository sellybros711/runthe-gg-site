/* The gate, launched. Anybody gets the page and its modules. The report
 * (admins only) and any path the game does not know answer exactly as
 * Stumpire answers a stranger: the site's 404 page, status 404, no-store.
 * These drive the real Pages Functions (Last Shot's and Stumpire's) side by
 * side against a fake Supabase, so "exactly" is measured, not claimed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render, MODULE_FILES } from '../build/pages.mjs';
import { PAGE, MODULES, BUILD } from '../pages.js';
import { pageGate } from '../gate.js';
import { forgetRoles } from '../db-supabase.js';
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

test('anybody gets the page and every browser module, signed in or not, with no database', async () => {
  for (const uid of [null, undefined, '', 'stranger', 't', 'a']) {
    const page = pageGate('', uid);
    assert.equal(page.body, PAGE, String(uid));
    assert.match(page.type, /text\/html/);
    for (const f of MODULE_FILES) assert.equal(pageGate('m/' + f).body, MODULES[f], f);
  }
});

test('server files and unknown paths are never served', async () => {
  for (const sub of ['m/gate.js', 'm/db-supabase.js', 'm/pages.js', 'm/../gate.js', 'admin', 'x', 'm', 'm/', 'm/sim.js/x', 'web/play.html', 'build/pages.mjs'])
    assert.equal(pageGate(sub), null, sub);
  for (const f of ['gate.js', 'db-supabase.js', 'pages.js']) assert.ok(!(f in MODULES), f + ' is not a browser module');
});

test('the page is indexable, says nothing about testers, carries its share card, and loads only served modules', () => {
  assert.doesNotMatch(PAGE, /name=["']robots["'][^>]*noindex/i);
  assert.doesNotMatch(PAGE, /TESTERS ONLY/i);
  assert.match(PAGE, /<link rel="canonical" href="https:\/\/runthe\.gg\/last-shot\/">/);
  assert.match(PAGE, /<meta name="description" content="[^"]{50,}">/);
  assert.match(PAGE, /property="og:image" content="https:\/\/runthe\.gg\/assets\/last-shot-og_1200x630\.png"/);
  assert.match(PAGE, /name="twitter:card" content="summary_large_image"/);
  const ld = JSON.parse(PAGE.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'VideoGame'); assert.equal(ld.url, 'https://runthe.gg/last-shot/');
  assert.ok(fs.existsSync(path.join(REPO, 'assets/last-shot-og_1200x630.png')), 'the share image is in the repo');
  assert.ok(PAGE.includes('/last-shot/m/client.js'));
  for (const [f, src] of Object.entries(MODULES)) for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
    assert.ok(m[1].endsWith('?b=' + BUILD), f + ' imports ' + m[1] + ' without the build (a cached module would go stale)');
    const to = path.posix.normalize(m[1].replace(/\?.*$/, '')).replace(/^\.\//, '');
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

test('anybody gets the page and its modules from the Function; only the page is for a crawler', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = fakeSupabase({ tess: 'tester' });
  try {
    const now = Date.now();
    const cases = [
      ['no database configured', {}, null],
      ['signed out, no cookie', SECRET_ENV, null],
      ['a forged cookie', SECRET_ENV, 'stranger.' + (Math.floor(now / 1000) + 99) + '.AAAA'],
      ['signed in, not a tester', SECRET_ENV, await sign(SECRET, 'stranger', now)],
      ['a tester', SECRET_ENV, await sign(SECRET, 'tess', now)]
    ];
    for (const [name, env, cookie] of cases) {
      const a = await snap(await LAST(ctx('https://runthe.gg/last-shot', env, cookie)));
      assert.equal(a.status, 200, name);
      assert.equal(a.body, PAGE, name);
      assert.equal(a.cache, 'no-store', name);
      assert.equal(a.robots, null, name + ': the page is indexable');
      const m = await snap(await LAST(ctx('https://runthe.gg/last-shot/m/sim.js', env, cookie)));
      assert.equal(m.status, 200, name); assert.match(m.type, /javascript/); assert.equal(m.body, MODULES['sim.js']);
      assert.equal(m.robots, 'noindex, nofollow', name + ': a module is not for a crawler');
    }
  } finally { globalThis.fetch = real; }
});

test('a path it does not know, and the report for anybody but an admin, get exactly the answer Stumpire gives a stranger', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = fakeSupabase({ tess: 'tester', ada: 'admin' });
  try {
    const now = Date.now();
    const b = await snap(await STUMP(ctx('https://runthe.gg/arcade/stumpire/', SECRET_ENV, null)));
    assert.equal(b.status, 404);
    const cases = [
      ['no database configured', {}, null],
      ['signed out, no cookie', SECRET_ENV, null],
      ['a forged cookie', SECRET_ENV, 'ada.' + (Math.floor(now / 1000) + 99) + '.AAAA'],
      ['signed in, not a tester', SECRET_ENV, await sign(SECRET, 'stranger', now)],
      ['a tester', SECRET_ENV, await sign(SECRET, 'tess', now)],
      ['an expired admin cookie', SECRET_ENV, await sign(SECRET, 'ada', now - 13 * 3600 * 1000)]
    ];
    for (const [name, env, cookie] of cases) {
      for (const p of ['report', 'report/', 'm/gate.js', 'm/pages.js', 'x', 'web/play.html']) {
        const a = await snap(await LAST(ctx('https://runthe.gg/last-shot/' + p, env, cookie)));
        assert.deepEqual(a, b, name + ' ' + p + ': Last Shot and Stumpire differ');
        assert.equal(a.body, NOT_FOUND_HTML, name + ' ' + p + ': the site 404 page');
      }
    }
    const admin = await sign(SECRET, 'ada', now);
    const r = await snap(await LAST(ctx('https://runthe.gg/last-shot/report', SECRET_ENV, admin)));
    assert.equal(r.status, 200, 'an admin gets the report');
    assert.equal(r.cache, 'no-store'); assert.equal(r.robots, 'noindex, nofollow');
    assert.match(r.body, /noindex/);
  } finally { globalThis.fetch = real; }
});

test('a module at this build is cached a year by anybody; the page and anything else never', async () => {
  const real = globalThis.fetch;
  let reads = 0;
  const fake = fakeSupabase({ tess: 'tester' });
  globalThis.fetch = (u, i) => { if (String(u).includes('stumpire_testers')) reads++; return fake(u, i); };
  forgetRoles();
  try {
    const get = async url => snap(await LAST(ctx(url, SECRET_ENV, null)));
    const cur = await get('https://runthe.gg/last-shot/m/sim.js?b=' + BUILD);
    assert.equal(cur.status, 200); assert.equal(cur.cache, 'public, max-age=31536000, immutable');
    assert.equal((await get('https://runthe.gg/last-shot/m/sim.js?b=0000000000')).cache, 'no-store', 'an old build is not kept');
    assert.equal((await get('https://runthe.gg/last-shot/m/sim.js')).cache, 'no-store', 'no build, no keeping');
    assert.equal((await get('https://runthe.gg/last-shot?b=' + BUILD)).cache, 'no-store', 'the page never');
    // a page load: the page and every module, and the tester list is never asked
    reads = 0;
    const cookie = await sign(SECRET, 'tess', Date.now());
    await snap(await LAST(ctx('https://runthe.gg/last-shot', SECRET_ENV, cookie)));
    for (const f of MODULE_FILES) await get('https://runthe.gg/last-shot/m/' + f + '?b=' + BUILD);
    assert.equal(reads, 0, 'a page load reads no database, not ' + reads + ' times');
  } finally { globalThis.fetch = real; forgetRoles(); }
});
