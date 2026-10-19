/* Screenshots, a video and frame rates of the lab scene, in headless Chromium.
 *
 *   node shut-the-door/lab/pipeline/shoot.mjs OUTDIR [shots|video|perf|one QUERY T W H NAME]
 *
 * Headless Chromium has no GPU here: WebGL runs on SwiftShader (software), so it is launched with
 * --use-angle=swiftshader --enable-unsafe-swiftshader. Software GL is far slower than a phone's GPU;
 * perf reports it as measured and says so.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.resolve(process.argv[2] || 'shots');
const WHAT = process.argv[3] || 'shots';
fs.mkdirSync(OUT, { recursive: true });

function loadPlaywright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.png': 'image/png' };
let bytes = 0;
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  bytes += fs.statSync(f).size;
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/shut-the-door/lab/index.html`;
const pw = loadPlaywright();
const browser = await pw.chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function open(query, w, h, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: extra.dsf ?? (w < 800 ? 2 : 1), ...(extra.ctx || {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  bytes = 0;
  await page.goto(`${BASE}?${query}`);
  const failed = new Promise((_, rej) => page.on('pageerror', (e) => rej(e)));
  await Promise.race([page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 180000 }), failed]);
  return { ctx, page, errors };
}

async function still(query, t, w, h, name) {
  const { ctx, page, errors } = await open(`${query}&t=${t}`, w, h);
  await page.evaluate((tt) => window.__lab.setTime(tt), t);
  await page.waitForFunction(() => window.__lab.frames > 3, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  if (errors.length) console.log('  page messages:', errors.slice(0, 5).join(' | '));
  await ctx.close();
  console.log('shot', file);
}

if (WHAT === 'strip') {
  // one page, many moments: node shoot.mjs OUT strip QUERY W H NAME t1,t2,...
  const [q, w, h, name, ts] = process.argv.slice(4);
  const { ctx, page } = await open(`${q}&t=0`, +w, +h, { dsf: 1 });
  let k = 0;
  for (const t of ts.split(',').map(Number)) {
    await page.evaluate((tt) => window.__lab.setTime(tt), t);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.join(OUT, `${name}-${String(k++).padStart(2, '0')}.png`) });
  }
  await ctx.close();
  console.log('strip', name, k);
}

if (WHAT === 'poster') {
  // the stills index.html shows while the scene loads: the set, at the phone and desktop sizes
  const { execFileSync } = await import('node:child_process');
  const ASSETS = path.join(ROOT, 'shut-the-door', '3d', 'assets');
  for (const [w, h, name] of [[390, 844, 'poster-phone'], [1440, 900, 'poster-desktop']]) {
    await still('', 0, w, h, name);
    const png = path.join(OUT, `${name}.png`);
    execFileSync('python3', ['-I', '-c', `import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGB')\nim.save(sys.argv[2],'WEBP',quality=58,method=6)`, png, path.join(ASSETS, `${name}.webp`)]);
    console.log('poster', name, fs.statSync(path.join(ASSETS, `${name}.webp`)).size);
  }
  // the game's home screen hero (330 px tall, a phone's width to a column's): the set with no grid
  await still('overlays=0', 0, 560, 330, 'hero');
  execFileSync('python3', ['-I', '-c', `import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGB')\nim.save(sys.argv[2],'WEBP',quality=62,method=6)`, path.join(OUT, 'hero.png'), path.join(ASSETS, 'hero.webp')]);
  console.log('poster hero', fs.statSync(path.join(ASSETS, 'hero.webp')).size);
}

if (WHAT === 'one') {
  const [q, t, w, h, name] = process.argv.slice(4);
  await still(q, parseFloat(t), +w, +h, name);
}

if (WHAT === 'shots') {
  const timesOf = async (q) => {
    const { ctx, page } = await open(q + '&t=0', 390, 844, { dsf: 1 });
    const r = await page.evaluate(() => window.__lab.times);
    await ctx.close();
    return r;
  };
  const sw = await timesOf('');
  const tk = await timesOf('take=1');
  for (const [w, h, tag] of [[390, 844, 'phone'], [1440, 900, 'desktop']]) {
    await still('', 0.2, w, h, `${tag}-1-set`);
    const f = sw.flight;
    await still('', sw.release + f * 0.18, w, h, `${tag}-2-flight-early`);
    await still('', sw.release + f * 0.55, w, h, `${tag}-3-flight-mid`);
    await still('', sw.release + f * 0.86, w, h, `${tag}-4-flight-late`);
    await still('', sw.plate, w, h, `${tag}-5-swing-contact`);
    await still('take=1', tk.catch + 0.05, w, h, `${tag}-6-take-receive`);
    await still('take=1', tk.plate + 1.0, w, h, `${tag}-7-take-call`);
  }
}

if (WHAT === 'video') {
  // Software GL draws about one frame a second here, so a live screen recording would be a slide
  // show. Instead the clock steps 1/30 s per frame, each frame is captured, and ffmpeg plays them
  // back at 30 fps: true speed, every frame. Playwright's recordVideo of the same stepped run is
  // kept beside it (raw.webm) as the literal capture; it runs slow.
  // node shoot.mjs OUT video [QUERY] [NAME]
  const q = process.argv[4] || '', name = process.argv[5] || 'pitch';
  const frames = path.join(OUT, `${name}-frames`);
  fs.mkdirSync(frames, { recursive: true });
  const { ctx, page } = await open(`${q}&t=0&once=1`, 390, 844, { dsf: 2, ctx: { recordVideo: { dir: OUT, size: { width: 390, height: 844 } } } });
  const N = Math.round(3.3 * 30);
  for (let i = 0; i <= N; i++) {
    await page.evaluate((t) => window.__lab.setTime(t), i / 30);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`) });
  }
  const v = page.video();
  await ctx.close();
  const raw = await v.path();
  fs.renameSync(raw, path.join(OUT, `${name}-raw.webm`));
  const { execFileSync } = await import('node:child_process');
  const src = path.join(frames, 'f%04d.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', src, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path.join(OUT, `${name}.mp4`)]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', src, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', path.join(OUT, `${name}.webm`)]);
  fs.rmSync(frames, { recursive: true });
  console.log('video', path.join(OUT, `${name}.mp4`));
}

if (WHAT === 'perf') {
  const results = [];
  for (const [label, w, h, throttle, q] of [
    ['desktop 1440x900', 1440, 900, 1, 'dpr=1'],
    ['phone 390x844 dpr 2, CPU 4x', 390, 844, 4, ''],
    ['phone 390x844 dpr 1, CPU 4x', 390, 844, 4, 'dpr=1'],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 800 ? 2 : 1 });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    bytes = 0;
    const t0 = Date.now();
    await page.goto(`${BASE}?loop=1${q ? '&' + q : ''}`);
    await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 300000 });
    const ready = Date.now() - t0;
    const firstFrame = await page.evaluate(() => window.__lab.firstFrameMs);
    const f0 = await page.evaluate(() => window.__lab.frames);
    const s0 = Date.now();
    await page.waitForTimeout(12000);
    const f1 = await page.evaluate(() => window.__lab.frames);
    const fps = (f1 - f0) / ((Date.now() - s0) / 1000);
    const m = await page.evaluate(() => ({ upd: window.__lab.updMs, rnd: window.__lab.rndMs, calls: window.__lab.calls, tris: window.__lab.tris }));
    results.push({ label, fps: +fps.toFixed(1), updateMsPerFrame: +m.upd.toFixed(2), renderSubmitMs: +m.rnd.toFixed(1), drawCalls: m.calls, triangles: m.tris, firstFrameMs: Math.round(firstFrame), readyMs: ready, bytes });
    await ctx.close();
  }
  console.log(JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(results, null, 1));
}

await browser.close();
server.close();
