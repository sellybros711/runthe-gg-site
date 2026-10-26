/* What /last-shot serves. Since 2026-10-26 the game is open to anybody with
 * the link (unlisted, not gated): everybody gets the page and its modules,
 * nothing else under /last-shot is served, and the page stays noindexed.
 * check-posture.mjs holds the "linked from nowhere public" half. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render, MODULE_FILES } from '../build/pages.mjs';
import { PAGE, MODULES } from '../pages.js';
import { serve } from '../serve.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(ROOT, '../..');
const FN = (await import(pathToFileURL(path.join(REPO, 'functions/last-shot/[[path]].js')).href)).onRequest;
const NOT_FOUND_HTML = fs.readFileSync(path.join(REPO, '404.html'), 'utf8');

test('pages.js is up to date with its sources', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'pages.js'), 'utf8'), render(), 'run node functions/_lastshot/build/pages.mjs');
});

test('the page and every browser module are served', () => {
  assert.equal(serve('').body, PAGE);
  assert.match(serve('').type, /text\/html/);
  for (const f of MODULE_FILES) assert.equal(serve('m/' + f).body, MODULES[f], f);
});

test('server files and unknown paths are never served', () => {
  for (const sub of ['m/serve.js', 'm/pages.js', 'm/../serve.js', 'm/constructor', 'm/__proto__', 'admin', 'x', 'm', 'm/', 'm/sim.js/x', 'web/play.html', 'build/pages.mjs'])
    assert.equal(serve(sub), null, sub);
  for (const f of ['serve.js', 'pages.js']) assert.ok(!(f in MODULES), f + ' is not a browser module');
});

test('the page is noindexed and loads only modules it serves', () => {
  assert.match(PAGE, /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(!/TESTERS ONLY/.test(PAGE), 'the game is no longer tester-only');
  assert.ok(PAGE.includes('/last-shot/m/client.js'));
  for (const [f, src] of Object.entries(MODULES)) for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
    const to = path.posix.normalize(m[1]).replace(/^\.\//, '');
    assert.ok(MODULES[to] != null, f + ' imports ' + to + ', which is not served');
  }
});

/* ---------- the Pages Function itself ---------- */
function ctx(url, env = {}) {
  const sub = new URL(url).pathname.replace(/^\/last-shot\/?/, '');
  return {
    request: new Request(url), env: { ...env, ASSETS: { fetch: async () => new Response(NOT_FOUND_HTML, { status: 200 }) } },
    params: { path: sub ? sub.split('/') : [] }
  };
}
const snap = async res => ({ status: res.status, type: res.headers.get('Content-Type'), cache: res.headers.get('Cache-Control'), robots: res.headers.get('X-Robots-Tag'), body: await res.text() });

test('anybody gets the page, with no account, cookie or database', async () => {
  const a = await snap(await FN(ctx('https://runthe.gg/last-shot')));
  assert.equal(a.status, 200);
  assert.equal(a.body, PAGE);
  assert.equal(a.cache, 'no-store');
  assert.equal(a.robots, 'noindex, nofollow');
  const m = await snap(await FN(ctx('https://runthe.gg/last-shot/m/sim.js')));
  assert.equal(m.status, 200); assert.match(m.type, /javascript/); assert.equal(m.body, MODULES['sim.js']);
});

test('any other path is the site 404 page', async () => {
  for (const u of ['https://runthe.gg/last-shot/m/serve.js', 'https://runthe.gg/last-shot/nope']) {
    const r = await snap(await FN(ctx(u)));
    assert.equal(r.status, 404, u);
    assert.equal(r.body, NOT_FOUND_HTML, u);
  }
});
