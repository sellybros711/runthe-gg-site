/* How fast the lab, or the game's 3D mound, comes up on a phone's network, first visit and repeat.
 *
 *   node shut-the-door/lab/pipeline/check-load.mjs [--runs 3]
 *   node shut-the-door/lab/pipeline/check-load.mjs --game [--runs 3]
 *
 * --game loads the game page (shut-the-door/index.html) instead, other hosts refused (fonts and
 * auth answer nothing), and records: home (the home screen up), preloaded (every 3D download in
 * and parsed, started from the home screen), the tap on take the mound 4 s in (a player reading
 * the spot), and mound (the 3D mound drawn), ms after that tap.
 *
 * Serves the repo the way the site is served: text compressed (as the CDN does), and the cache
 * rules of the repo's _headers file for the lab (HTML revalidated, versioned files held). Then, in
 * headless Chromium with a Fast 4G profile (9 Mbps down, 1.5 up, 170 ms round trip) and the CPU
 * slowed 4x, it records:
 *   firstPaint   the first frame of the park on screen (window.__lab.firstPaintMs)
 *   loaded       everything downloaded, parsed, set up and its shaders compiled (__lab.marks.compiled):
 *                the scene is ready to draw
 *   playable     the first full frame of it drawn (__lab.readyMs)
 *   bytes        what crossed the network, and per file
 * for a first visit (empty cache) and a repeat visit (same browser, page loaded again).
 *
 * WebGL here is SwiftShader (software, no GPU), so a frame costs far more than on a phone and
 * playable includes that (one frame here is 1-2 s at 4x CPU, a few ms on a phone's GPU). loaded is
 * the same moment without the software drawing.
 */
import fs from 'node:fs';
import path from 'node:path';
import http2 from 'node:http2';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const RUNS = +(process.argv[process.argv.indexOf('--runs') + 1] || 2) || 2;
const GAME = process.argv.includes('--game');

/* _headers, read for the paths it names (exact, or a trailing *), last match wins per header. */
const rules = [];
{
  let cur = null;
  for (const line of fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { pat: line.trim(), headers: {} }; rules.push(cur); continue; }
    const [k, ...v] = line.trim().split(':');
    if (cur) cur.headers[k.trim().toLowerCase()] = v.join(':').trim();
  }
}
function headersFor(p) {
  const out = {};
  for (const r of rules) {
    // a * matches anything, slashes included (Cloudflare's splat)
    const re = new RegExp('^' + r.pat.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    if (re.test(p)) Object.assign(out, r.headers);
  }
  return out;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.png': 'image/png', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream' };
const TEXT = new Set(['.html', '.js', '.json']);
let log = [];
const brCache = new Map();
// HTTP/2 over TLS, as the CDN serves it (HTTP/1.1 would cap the page at 6 connections). A
// throwaway self-signed certificate, made once in the temp folder.
const CERT = path.join(os.tmpdir(), 'std-lab-check-load-cert');
if (!fs.existsSync(path.join(CERT, 'key.pem'))) {
  fs.mkdirSync(CERT, { recursive: true });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(CERT, 'key.pem'), '-out', path.join(CERT, 'cert.pem'), '-days', '30', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
}
// Chrome trusts it by its key hash: --ignore-certificate-errors would also switch off the HTTP
// cache, and the cache is half of what this measures.
const SPKI = execFileSync('sh', ['-c', 'openssl x509 -in "$1" -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64', 'sh', path.join(CERT, 'cert.pem')]).toString().trim();
const server = http2.createSecureServer({ key: fs.readFileSync(path.join(CERT, 'key.pem')), cert: fs.readFileSync(path.join(CERT, 'cert.pem')), allowHTTP1: true }, (req, res) => {
  const u = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const ext = path.extname(f);
  const h = { 'content-type': TYPES[ext] || 'application/octet-stream', ...headersFor(u.pathname) };
  const etag = etagOf(f);
  h.etag = etag;
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); log.push([u.pathname, 304, 0]); return; }
  let body = fs.readFileSync(f);
  // compressed once and kept, as the CDN keeps it (compressing per request would time this server)
  if (TEXT.has(ext) && /br/.test(req.headers['accept-encoding'] || '')) { body = brCache.get(f + etag) ?? brCache.set(f + etag, zlib.brotliCompressSync(body)).get(f + etag); h['content-encoding'] = 'br'; }
  res.writeHead(200, h);
  res.end(body);
  log.push([u.pathname + u.search, 200, body.length]);
});
// compress the lab's text files before the clock starts
const etagOf = (f) => '"' + fs.statSync(f).mtimeMs.toString(36) + fs.statSync(f).size.toString(36) + '"';
const STD = path.join(ROOT, 'shut-the-door');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (['pipeline', 'data', 'test', 'fixtures', 'scenarios'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
for (const f of walk(STD)) if (TEXT.has(path.extname(f))) brCache.set(f + etagOf(f), zlib.brotliCompressSync(fs.readFileSync(f)));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `https://127.0.0.1:${server.address().port}/shut-the-door/${GAME ? '' : 'lab/index.html'}`;

function loadPlaywright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, args: [`--ignore-certificate-errors-spki-list=${SPKI}`, '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
  ...(GAME ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] : [])] });

// each visit in a new tab of the same browser profile (the cache is the profile's), throttled
async function visit(ctx) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  log = [];
  if (GAME) return visitGame(page);
  await page.goto(BASE + '?once=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__lab && window.__lab.firstPaintMs != null, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 180000 });
  const m = await page.evaluate(() => ({ fp: window.__lab.firstPaintMs, ready: window.__lab.readyMs ?? window.__lab.firstFrameMs, marks: window.__lab.marks, timeline: performance.getEntriesByType('resource').map((e) => [e.name.replace(/^.*\/lab\//, '').replace(/\?.*$/, ''), Math.round(e.startTime), Math.round(e.responseEnd)]) }));
  await page.close();
  const bytes = log.reduce((a, [, , b]) => a + b, 0);
  return { firstPaintMs: Math.round(m.fp), loadedMs: m.marks?.compiled ?? null, playableMs: Math.round(m.ready), bytes, requests: log.length, files: log.filter(([, s]) => s === 200).map(([p, , b]) => [p, b]), marks: m.marks, timeline: m.timeline };
}

async function visitGame(page) {
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.waitForSelector('#h-main:not([hidden])', { timeout: 120000 });
  const home = await page.evaluate(() => Math.round(performance.now()));
  await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.marks.preloaded, null, { timeout: 180000 });
  const pre = await page.evaluate(() => window.STD_STAGE.marks.preloaded);
  await page.waitForFunction(() => performance.now() > 4000, null, { timeout: 30000 });
  const tap = await page.evaluate(() => Math.round(performance.now()));
  await page.click('#b-take');
  await page.waitForFunction(() => window.STD_STAGE.marks.drawn, null, { timeout: 180000 });
  const drawn = await page.evaluate(() => window.STD_STAGE.marks.drawn);
  await page.close();
  const bytes = log.reduce((a, [, , b]) => a + b, 0);
  return { firstPaintMs: home, loadedMs: pre, playableMs: drawn - tap, bytes, requests: log.length, files: log.filter(([, s]) => s === 200).map(([p, , b]) => [p, b]), marks: { home, preloaded: pre, tap, drawn } };
}

const results = [];
process.on('exit', () => server.close());
for (let r = 0; r < RUNS; r++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const first = await visit(ctx);
  const again = await visit(ctx);
  results.push({ first, again });
  await ctx.close();
}
const med = (k, w) => { const v = results.map((x) => x[w][k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
const out = {
  page: GAME ? 'the game: firstPaintMs is the home screen, loadedMs every 3D download in and parsed, playableMs the mound drawn after the tap on take the mound' : 'the lab',
  profile: 'Fast 4G (9 Mbps down, 1.5 up, 170 ms RTT), CPU 4x, 390x844 at 2x, SwiftShader',
  first: { firstPaintMs: med('firstPaintMs', 'first'), loadedMs: med('loadedMs', 'first'), playableMs: med('playableMs', 'first'), bytes: results[0].first.bytes, requests: results[0].first.requests },
  repeat: { firstPaintMs: med('firstPaintMs', 'again'), loadedMs: med('loadedMs', 'again'), playableMs: med('playableMs', 'again'), bytes: results[0].again.bytes, requests: results[0].again.requests },
  files: results[0].first.files.sort((a, b) => b[1] - a[1]),
  repeatFiles: results[0].again.files,
  marks: { first: results[0].first.marks, repeat: results[0].again.marks },
  timeline: results[0].first.timeline,
};
console.log(JSON.stringify(out, null, 1));
await browser.close();
server.close();
