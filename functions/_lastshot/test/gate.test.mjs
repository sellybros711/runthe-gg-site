/* The launch, served static. Anybody gets the page and its modules as plain
 * files in last-shot/ (no Function, no database). Only /last-shot/e and
 * /last-shot/report are Pages Functions, and the report (admins only) answers
 * anybody else exactly as Stumpire answers a stranger: the site's 404 page,
 * status 404, no-store. These drive the real route files and Stumpire's
 * Function side by side against a fake Supabase, so "exactly" is measured,
 * not claimed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render, MODULE_FILES, STATIC_DIR, staticFiles, listStatic, staticProblems } from '../build/pages.mjs';
import { PAGE, MODULES, BUILD } from '../pages.js';
import { sign, COOKIE } from '../../_stumpire/cookie.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(ROOT, '../..');
const fnUrl = p => pathToFileURL(path.join(REPO, p)).href;
const EVENTS = (await import(fnUrl('functions/last-shot/e.js'))).onRequest;
const REPORT = (await import(fnUrl('functions/last-shot/report.js'))).onRequest;
const STUMP = (await import(fnUrl('functions/arcade/stumpire/[[path]].js'))).onRequest;
const NOT_FOUND_HTML = fs.readFileSync(path.join(REPO, '404.html'), 'utf8');
/* what Pages would run for a path under /last-shot/: a route file for its own
   path only, and nothing (a static file or the 404) for anything else */
const ROUTE = { e: EVENTS, report: REPORT };

test('pages.js is up to date with its sources', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'pages.js'), 'utf8'), render(), 'run node functions/_lastshot/build/pages.mjs');
});

test('the static folder is up to date with its sources, and holds nothing else', () => {
  assert.deepEqual(staticProblems(), [], 'run node functions/_lastshot/build/pages.mjs');
  assert.deepEqual(listStatic(), ['index.html', ...MODULE_FILES.map(f => 'm/' + f)].sort());
  assert.equal(fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8'), PAGE, 'the folder and the bundle are one build');
  for (const f of MODULE_FILES) assert.equal(fs.readFileSync(path.join(STATIC_DIR, 'm', f), 'utf8'), MODULES[f], f);
  assert.deepEqual(Object.keys(staticFiles()).sort(), listStatic());
});

test('the drift check sees a stale, a missing and a stray file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastshot-drift-'));
  try {
    for (const [f, text] of Object.entries(staticFiles())) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), text); }
    assert.deepEqual(staticProblems(tmp), []);
    fs.appendFileSync(path.join(tmp, 'm/sim.js'), '//');
    fs.rmSync(path.join(tmp, 'm/court.js'));
    fs.writeFileSync(path.join(tmp, 'm/gate.js'), 'x');
    assert.deepEqual(staticProblems(tmp).sort(), ['last-shot/m/court.js is missing', 'last-shot/m/gate.js is not a file the build writes', 'last-shot/m/sim.js is stale']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('server files are never in the static folder', () => {
  const have = listStatic();
  for (const f of ['gate.js', 'db-supabase.js', 'pages.js', 'route.js', 'events.js', 'report.js']) {
    assert.ok(!(f in MODULES), f + ' is not a browser module');
    assert.ok(!have.includes('m/' + f) && !have.includes(f), f + ' is not served');
  }
  assert.ok(!have.some(f => /^(web|build|test)\//.test(f)));
});

test('only the two routes are Functions under /last-shot/', () => {
  assert.deepEqual(fs.readdirSync(path.join(REPO, 'functions/last-shot')).sort(), ['e.js', 'report.js'],
    'a catch all ([[path]].js) or another route here would put the page and its modules back behind a Function');
  assert.ok(!fs.existsSync(path.join(REPO, '_routes.json')), 'a root _routes.json decides every Function on the site; Pages builds its own from functions/');
});

test('_headers keeps a module a year, revalidates the page, and keeps modules from crawlers', () => {
  const h = fs.readFileSync(path.join(REPO, '_headers'), 'utf8');
  assert.match(h, /^\/last-shot\/m\/\*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Robots-Tag: noindex, nofollow$/m);
  assert.match(h, /^\/last-shot\/\n  Cache-Control: no-cache$/m);
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
  for (const m of PAGE.matchAll(/src="\/last-shot\/m\/([^"?]+)\?b=([^"]+)"/g)) {
    assert.equal(m[2], BUILD, 'the page loads ' + m[1] + ' at this build');
    assert.ok(fs.existsSync(path.join(STATIC_DIR, 'm', m[1])), 'the page loads ' + m[1] + ', which is not in last-shot/m/');
  }
  assert.ok(PAGE.includes('/last-shot/m/client.js?b=' + BUILD));
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

function ctx(url, env, cookie, init = {}) {
  const headers = new Headers(cookie ? { Cookie: COOKIE + '=' + cookie } : {});
  const sub = new URL(url).pathname.replace(/^\/(last-shot|arcade\/stumpire)\/?/, '');
  return {
    request: new Request(url, { headers, ...init }), env: { ...env, ASSETS: { fetch: async () => new Response(NOT_FOUND_HTML, { status: 200 }) } },
    params: { path: sub ? sub.split('/') : [] }
  };
}

async function snap(res) {
  return { status: res.status, type: res.headers.get('Content-Type'), cache: res.headers.get('Cache-Control'), robots: res.headers.get('X-Robots-Tag'), body: await res.text() };
}

test('the report and the events: refusals get exactly the answer Stumpire gives a stranger', async () => {
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
      for (const p of ['report', 'report/']) {
        const a = await snap(await REPORT(ctx('https://runthe.gg/last-shot/' + p, env, cookie)));
        assert.deepEqual(a, b, name + ' ' + p + ': Last Shot and Stumpire differ');
        assert.equal(a.body, NOT_FOUND_HTML, name + ' ' + p + ': the site 404 page');
      }
      /* the events: GET is never an answer, whoever asks */
      assert.deepEqual(await snap(await EVENTS(ctx('https://runthe.gg/last-shot/e', env, cookie))), b, name + ' GET e');
    }
    /* a guest's events with no device id, and anything without a database */
    const post = (env, cookie, body) => EVENTS(ctx('https://runthe.gg/last-shot/e', env, cookie, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));
    assert.deepEqual(await snap(await post(SECRET_ENV, null, { events: [{ name: 'open' }] })), b, 'a guest with no device id');
    assert.deepEqual(await snap(await post({}, await sign(SECRET, 'ada', now), { events: [{ name: 'open' }] })), b, 'no database');
    /* an admin: the report, never cached, never for a crawler */
    const admin = await sign(SECRET, 'ada', now);
    const r = await snap(await REPORT(ctx('https://runthe.gg/last-shot/report', SECRET_ENV, admin)));
    assert.equal(r.status, 200, 'an admin gets the report');
    assert.equal(r.cache, 'no-store'); assert.equal(r.robots, 'noindex, nofollow');
    assert.match(r.body, /noindex/);
    /* the report answers a GET only, even for an admin */
    const p = await snap(await REPORT(ctx('https://runthe.gg/last-shot/report', SECRET_ENV, admin, { method: 'POST', body: '{}' })));
    assert.deepEqual(p, b, 'POST report');
  } finally { globalThis.fetch = real; }
});

test('the routes are what Pages runs, and nothing else under /last-shot/ is', () => {
  assert.equal(typeof ROUTE.e, 'function'); assert.equal(typeof ROUTE.report, 'function');
  for (const f of fs.readdirSync(path.join(REPO, 'functions/last-shot'))) {
    const src = fs.readFileSync(path.join(REPO, 'functions/last-shot', f), 'utf8');
    assert.match(src, /from '\.\.\/_lastshot\/route\.js'/, f + ' answers through route.js');
    assert.doesNotMatch(src, /pages\.js/, f + ' never imports the page bundle');
  }
});
