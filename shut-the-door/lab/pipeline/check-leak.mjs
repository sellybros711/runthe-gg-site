/* A long session in the real game page holds its size: nothing the mound makes per pitch or per play is
 * left behind.
 *
 *   node shut-the-door/lab/pipeline/check-leak.mjs                 the default session (OUTINGS outings)
 *   node shut-the-door/lab/pipeline/check-leak.mjs --outings N     a longer or shorter one
 *   node shut-the-door/lab/pipeline/check-leak.mjs --json F        every sample to a file
 *
 * The owner (2026-10-26, on an iPhone): "the game also gets very laggy as you play", worse over time.
 * So the check plays whole outings at 390x844 the way a player does (a pitch type, a cell, the throw,
 * both meter stops, a challenge when one is live, a tap on an earlier at bat's chip, run it back), with
 * every ball in play's broadcast and the first person passes drawn for real (software GL). At the
 * start of each outing (the same point in the game every time, so the counts compare) it reads:
 *   gpu      renderer.info: geometries, textures, programs; and the main pass's calls and triangles
 *   scene    objects in the scene and in the first person's scene
 *   page     DOM nodes (but the result screen's, rebuilt each outing as long as its pitches), live listeners (on a node still in the page, or window/document), pending
 *            animation frames, pending timeouts, live intervals, the JS heap after a forced GC
 *   frame    the JS time of each animation frame over the last outing (median and 95th)
 * The first pitch of every outing is a perfect power and a perfect release (the combo meter's stitches
 * and the ball's sparkle are made and freed once an outing); the run fails if none came off.
 * A count is held to the first measured outing's value (the first outing warms the caches): any later
 * outing above it fails. The heap is held to HEAP_SLACK over its early mean.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const OUTINGS = +arg('--outings', 7), JSON_OUT = arg('--json', null);
// the heap after a GC may wander a little (the engine's own caches, the JIT): this much over the early
// outings' mean is a leak
const HEAP_SLACK = 1.5e6;
const COUNTS = ['geometries', 'textures', 'programs', 'objects', 'fpObjects', 'dom', 'listeners', 'raf', 'timeouts', 'intervals'];

function loadPlaywright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) {} }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

/* In the page before anything runs: live animation frames, timers and listeners are counted, and the
   JS time of every animation frame is kept. */
const PROBE = () => {
  const L = window.__leak = { raf: new Map(), to: new Set(), iv: new Set(), ls: [], frames: [] };
  const rAF = window.requestAnimationFrame.bind(window), cAF = window.cancelAnimationFrame.bind(window);
  let inFrame = 0, frameT0 = 0;
  window.requestAnimationFrame = (cb) => {
    const id = rAF((ms) => {
      L.raf.delete(id);
      if (!inFrame) { inFrame = 1; frameT0 = performance.now(); queueMicrotask(() => {}); setTimeout0(); }
      cb(ms);
    });
    L.raf.set(id, 1);
    return id;
  };
  // the frame's JS time: from its first callback to the end of the task (a 0 ms message after it)
  const ch = new MessageChannel();
  // (and the frame the broadcast cuts in on, the first with the ballpark drawn: the classic hitch at contact)
  let wasOn = false;
  L.cuts = [];
  ch.port1.onmessage = () => {
    if (!inFrame) return;
    const ms = performance.now() - frameT0;
    L.frames.push(ms); inFrame = 0;
    if (L.frames.length > 4000) L.frames.splice(0, 2000);
    const st = window.STD_STAGE && window.STD_STAGE.current, ip = st && st.inplay;
    const on = !!(ip && ip.active && ip.park && ip.park.visible);
    if (on && !wasOn) L.cuts.push(ms);
    wasOn = on;
  };
  function setTimeout0() { ch.port2.postMessage(0); }
  window.cancelAnimationFrame = (id) => { L.raf.delete(id); return cAF(id); };
  const sT = window.setTimeout.bind(window), cT = window.clearTimeout.bind(window), sI = window.setInterval.bind(window), cI = window.clearInterval.bind(window);
  window.setTimeout = (fn, ms, ...a) => { const id = sT((...x) => { L.to.delete(id); if (typeof fn === 'function') fn(...x); }, ms, ...a); L.to.add(id); return id; };
  window.clearTimeout = (id) => { L.to.delete(id); return cT(id); };
  window.setInterval = (fn, ms, ...a) => { const id = sI(fn, ms, ...a); L.iv.add(id); return id; };
  window.clearInterval = (id) => { L.iv.delete(id); return cI(id); };
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  const cap = (o) => !!(o === true || (o && o.capture));
  EventTarget.prototype.addEventListener = function (type, fn, o) {
    if (fn && !L.ls.some((e) => e.fn === fn && e.type === type && e.cap === cap(o) && e.t.deref() === this)) L.ls.push({ t: new WeakRef(this), type, fn, cap: cap(o), once: !!(o && o.once) });
    return add.call(this, type, fn, o);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    const i = L.ls.findIndex((e) => e.fn === fn && e.type === type && e.cap === cap(o) && e.t.deref() === this);
    if (i >= 0) L.ls.splice(i, 1);
    return rem.call(this, type, fn, o);
  };
  window.STD_STAGE_TEST = { step: 1 / 12, renderEvery: 3 };
};

const browser = await loadPlaywright().chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
// (software GL on a busy machine can hold the page for many seconds after a tap: wait, never fail on it)
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.addInitScript(PROBE);
await page.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1') return route.continue();
  if (/fonts\./.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  if (u.hostname === 'cdn.jsdelivr.net') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  return route.abort();
});
const cdp = await ctx.newCDPSession(page);
await page.goto(`http://127.0.0.1:${server.address().port}/shut-the-door/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#h-main:not([hidden])', { timeout: 30000 });
await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 400000 });
// the main pass's own draw calls and triangles (the first person's pass after it resets info)
await page.evaluate(() => {
  const r = window.STD_STAGE.current.renderer, real = r.render;
  window.__leak.pass = { calls: 0, triangles: 0, ms: [] };
  r.render = function (scene, camera) {
    const t0 = performance.now();
    real.call(r, scene, camera);
    if (scene === window.STD_STAGE.current.scene) { window.__leak.pass.calls = r.info.render.calls; window.__leak.pass.triangles = r.info.render.triangles; window.__leak.pass.ms.push(performance.now() - t0); if (window.__leak.pass.ms.length > 4000) window.__leak.pass.ms.splice(0, 2000); }
  };
});

async function sample(label) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  const s = await page.evaluate(() => {
    const L = window.__leak, st = window.STD_STAGE.current, r = st.renderer;
    let objects = 0, fpObjects = 0;
    st.scene.traverse(() => { objects++; });
    if (st.fp && st.fp.scene) st.fp.scene.traverse(() => { fpObjects++; });
    L.ls = L.ls.filter((e) => { const t = e.t.deref(); return t && (t === window || t === document || (t.isConnected !== false)); });
    const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b.length ? +b[Math.min(b.length - 1, Math.floor(b.length * p))].toFixed(2) : 0; };
    const out = {
      geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: (r.info.programs || []).length,
      calls: L.pass.calls, triangles: L.pass.triangles, objects, fpObjects,
      // (the result screen is rebuilt for each outing, as long as its pitches: it is not counted)
      dom: document.getElementsByTagName('*').length - (document.getElementById('s-result') ? document.getElementById('s-result').getElementsByTagName('*').length : 0), listeners: L.ls.length, raf: L.raf.size, timeouts: L.to.size, intervals: L.iv.size,
      frameMed: q(L.frames, 0.5), frame95: q(L.frames, 0.95), drawMed: q(L.pass.ms, 0.5), frames: L.frames.length,
      cutMed: q(L.cuts, 0.5), cutMax: q(L.cuts, 1), cuts: L.cuts.length,
      // (where the page's nodes are: by the nearest ancestor with an id, for a count that grows)
      domBy: (() => { const m = {}; for (const el of document.getElementsByTagName('*')) { const a = el.parentElement && el.parentElement.closest('[id]'); const k = a ? '#' + a.id : el.tagName; m[k] = (m[k] || 0) + 1; } return m; })(),
    };
    L.frames.length = 0; L.pass.ms.length = 0; L.cuts.length = 0;
    return out;
  });
  return { label, heap, ...s };
}

/* One pitch the way a player throws it. Returns false when the outing is over. */
// (mostly over the plate: a session of balls in play, each with its broadcast)
const CELLS = [12, 7, 13, 17, 11, 12, 6, 8, 16, 18, 12, 23];
let pitchNo = 0, inPlays = 0, challenges = 0, chips = 0, firstOfOuting = true;
const lap = (() => { let t = Date.now(); return (w) => { const d = Date.now() - t; t = Date.now(); if (process.env.LEAK_VERBOSE && d > 15000) console.log(`    slow: ${w} ${Math.round(d / 1000)} s`); }; })();
// (a tap is the element's own click, sent in the page: Playwright's waits for a painted, stable frame
// cost most of a minute a tap in software GL on a busy machine, and the session is hundreds of taps)
const tap = (sel) => page.evaluate((q) => { const el = document.querySelector(q); if (!el) throw new Error('no ' + q); el.click(); }, sel);
// (the meter stops on the finger coming down)
const press = (sel) => page.evaluate((q) => { const el = document.querySelector(q), r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true })); }, sel);
/* PERFECT AND PERFECT (the combo meter, the owner 2026-10-26): the first pitch of every outing stops
   both bars perfectly, so the stitches and the ball's sparkle (3d/pitch.js buildSparkle) are made and
   freed once an outing and the counts compare across outings. Power: the stop when the column's
   needle is at its top (it turns there). The release: when the ring meets the target circle on its
   next closing pass, read from the ring's own start (meter-ui.js startAcc) and meter.js ringMs. */
let perfects = 0, sparkles = 0, perfectMiss = 0;
async function perfectStops() {
  await page.evaluate(() => {
    if (window.__leakRing) return;
    window.__leakRing = true;
    const st0 = window.setTimeout;
    window.setTimeout = function (fn, ms) {
      if (typeof fn === 'function' && fn.name === 'startAcc') return st0(function () { window.RING_T0 = performance.now(); fn(); }, ms);
      return st0.apply(this, arguments);
    };
  });
  await page.evaluate(() => { window.RING_T0 = null; window.__eLocked = null; });
  await page.evaluate(() => new Promise((res) => {
    const nd = document.querySelector('.rm-cneedle'), el = document.getElementById('m-meter'), t0 = performance.now();
    const f = () => {
      const m = /,\s*(-?[\d.]+)%/.exec(nd.style.transform), e = m ? -parseFloat(m[1]) / 100 : 0;
      if (e >= 0.985 || performance.now() - t0 > 8000) { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); window.__eLocked = Math.round(e * 100) / 100; res(); }
      else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  await page.evaluate(() => new Promise((res) => {
    const MT = window.STD_METER, el = document.getElementById('m-meter'), t0 = performance.now();
    const go = () => {
      if (window.RING_T0 == null) { if (performance.now() - t0 > 8000) return res(); return setTimeout(go, 5); }
      const P = MT.ringMs(window.__eLocked), k = Math.max(0, Math.ceil((performance.now() + 60 - window.RING_T0 - MT.MARK * P) / (2 * P))), tHit = window.RING_T0 + 2 * P * k + MT.MARK * P;
      const wait = () => {
        if (performance.now() < tHit - 30) return setTimeout(wait, 5);
        while (performance.now() < tHit) { /* the tap on the mark */ }
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        res();
      };
      wait();
    };
    go();
  }));
}
async function pitch() {
  lap('between pitches');
  if (await page.evaluate(() => document.getElementById('s-result').classList.contains('on'))) return false;
  // a challenge when one is live (an ABS replay), then a chip of an earlier at bat now and then
  if (await page.evaluate(() => { const b = document.getElementById('m-abs-b'); return b && !b.hidden && !b.disabled; })) {
    await tap('#m-abs-b'); challenges++; lap('challenge');
    await page.waitForTimeout(1800);
  }
  if (pitchNo % 5 === 3 && await page.$('#m-pas:not([hidden]) .pa-chip')) { await tap('#m-pas .pa-chip'); chips++; await page.waitForTimeout(120); }
  if (await page.evaluate(() => document.getElementById('s-result').classList.contains('on'))) return false;
  await page.waitForSelector('#m-arsenal .pitch').catch(async (e) => { await page.screenshot({ path: process.env.LEAKSHOT || '/tmp/leak-stuck.png' }); throw e; });
  const nTypes = await page.$$eval('#m-arsenal .pitch', (b) => b.length);
  await tap(`#m-arsenal .pitch:nth-child(${pitchNo % nTypes + 1})`); lap('pitch type');
  await tap(`#m-aim .cell[data-cell="${CELLS[pitchNo % CELLS.length]}"]`); lap('cell');
  await page.waitForFunction(() => !document.getElementById('m-throw').disabled);
  await tap('#m-throw'); lap('throw');
  const meter = await page.waitForSelector('#m-meter:not([hidden])', { timeout: 20000 }).then(() => true, () => false);
  const perfect = meter && firstOfOuting;
  firstOfOuting = false;
  if (perfect) {
    await perfectStops();
    // the sparkle is made with the pitch's flight; the call is in the log once the throw returns
    const sparkle = await page.waitForFunction(() => { const p = window.STD_STAGE.current.pitch; return !!(p && p.sparkle); }, null, { timeout: 60000, polling: 50 }).then(() => true, () => false);
    await page.waitForFunction(() => window.STD_UI.state.outing.log.length > 0, null, { timeout: 60000 }).catch(() => {});
    const pp = await page.evaluate(() => { const st = window.STD_UI.state.outing, c = (st.log.slice(-1)[0] || {}).call || {};
      return { pf: window.STD_METER.perfectOf(c.e, c.q).both, e: c.e, q: c.q }; }).catch(() => ({}));
    pp.sparkle = sparkle;
    if (pp.pf) perfects++; else perfectMiss++;
    if (pp.sparkle) sparkles++;
    if (process.env.LEAK_VERBOSE) console.log(`  perfect and perfect: e ${pp.e} q ${pp.q}, sparkle ${pp.sparkle}`);
  }
  if (meter) {
    // (both stops, pressed until each takes: the meter guards its first moments, and a slow page runs
    // its timers late)
    await page.waitForTimeout(80 + (pitchNo * 37) % 300);
    for (let k = 0; k < 60; k++) {
      const m = await page.evaluate(() => { const el = document.getElementById('m-meter'); return { gone: el.hidden || el.classList.contains('is-done'), busy: /pitching/.test(document.getElementById('m-throw').textContent) }; });
      if (m.gone || m.busy) break;
      await press('#m-meter');
      await page.waitForTimeout(350);
    }
  }
  pitchNo++;
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(100);
    const s = await page.evaluate(() => ({ busy: /pitching/.test(document.getElementById('m-throw').textContent), over: document.getElementById('s-result').classList.contains('on'),
      ip: !!(window.STD_STAGE.current.inplay && window.STD_STAGE.current.inplay.active) }));
    if (s.over) return false;
    if (!s.busy && !(await page.evaluate(() => !!window.STD_STAGE.current.playing))) break;
    if (Date.now() - t0 > 240000) throw new Error('pitch ' + pitchNo + ' still playing after 240 s');
  }
  const tr = await page.evaluate(() => window.STD_STAGE.current.trace && window.STD_STAGE.current.trace.summary);
  if (tr && tr.inPlay) inPlays++;
  if (process.env.LEAK_VERBOSE) {
    const g = await page.evaluate(() => { const r = window.STD_STAGE.current.renderer; return `geo ${r.info.memory.geometries} tex ${r.info.memory.textures} prog ${r.info.programs.length}`; });
    console.log(`  pitch ${pitchNo}: ${tr ? tr.result : '?'}${tr && tr.inPlay ? ' (in play)' : ''}, ${Math.round((Date.now() - t0) / 1000)} s, ${g}`);
  }
  return true;
}

await tap('#b-take');
await page.waitForSelector('#s-mound.on', { timeout: 60000 });
const rows = [];
const t0 = Date.now();
for (let o = 0; o < OUTINGS; o++) {
  await page.waitForTimeout(600);
  rows.push(await sample('outing ' + (o + 1)));
  const r = rows[rows.length - 1];
  console.log(`outing ${o + 1} (pitch ${pitchNo}, ${inPlays} in play, ${challenges} challenges, ${chips} chips, ${Math.round((Date.now() - t0) / 1000)} s): ` +
    `geo ${r.geometries} tex ${r.textures} prog ${r.programs} calls ${r.calls} tris ${r.triangles} obj ${r.objects}/${r.fpObjects} dom ${r.dom} ls ${r.listeners} raf ${r.raf} to ${r.timeouts} iv ${r.intervals} ` +
    `heap ${(r.heap / 1e6).toFixed(2)} MB frame ${r.frameMed}/${r.frame95} ms draw ${r.drawMed} ms (${r.frames} frames) cut frame ${r.cutMed}/${r.cutMax} ms (${r.cuts})`);
  firstOfOuting = true;
  while (await pitch());
  await page.waitForSelector('#s-result.on', { timeout: 60000 });
  await page.waitForTimeout(400);
  await tap('#r-again');
  await page.waitForSelector('#s-mound.on', { timeout: 60000 });
}
await page.waitForTimeout(600);
rows.push(await sample('end'));
const last = rows[rows.length - 1];
console.log(`end (pitch ${pitchNo}): geo ${last.geometries} tex ${last.textures} prog ${last.programs} obj ${last.objects}/${last.fpObjects} dom ${last.dom} ls ${last.listeners} raf ${last.raf} to ${last.timeouts} iv ${last.intervals} heap ${(last.heap / 1e6).toFixed(2)} MB frame ${last.frameMed}/${last.frame95} ms`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ pitches: pitchNo, inPlays, challenges, chips, rows }, null, 1));

// held to the second sample (the start of outing 2: the first outing warmed every cache)
let fails = 0;
const base = rows[1] || rows[0], late = rows.slice(2);
for (const k of COUNTS) {
  const worst = Math.max(...late.map((r) => r[k]));
  const bad = worst > base[k];
  if (bad) fails++;
  console.log(`  ${bad ? 'FAIL' : 'ok  '} ${k.padEnd(10)} ${base[k]} at outing 2, at most ${worst} after (${late.map((r) => r[k]).join(' ')})`);
}
// the nodes that grew, by where they are
if (rows.length > 2) {
  const a = rows[1].domBy, b = rows[rows.length - 1].domBy, d = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if ((b[k] || 0) !== (a[k] || 0)) d.push([k, (b[k] || 0) - (a[k] || 0)]);
  if (d.length) console.log('  DOM nodes by place, outing 2 to the end: ' + d.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 8).map(([k, v]) => k + ' ' + (v > 0 ? '+' : '') + v).join(', '));
}
const early = rows.slice(1, 3).reduce((a, r) => a + r.heap, 0) / Math.min(2, rows.length - 1);
const lateHeap = rows.slice(-2).reduce((a, r) => a + r.heap, 0) / 2;
const hb = lateHeap - early > HEAP_SLACK;
if (hb) fails++;
console.log(`  ${hb ? 'FAIL' : 'ok  '} heap       ${(early / 1e6).toFixed(2)} MB early, ${(lateHeap / 1e6).toFixed(2)} MB late (slack ${(HEAP_SLACK / 1e6).toFixed(1)} MB), ${((lateHeap - early) / Math.max(1, pitchNo) * 100 / 1e3).toFixed(1)} KB per 100 pitches`);
for (const e of errors.slice(0, 5)) console.log('  page error:', e);
// the effects were made and freed: a perfect and perfect pitch each outing, each with its sparkle
const pBad = perfects === 0 || sparkles < perfects;
console.log(`  ${pBad ? 'FAIL' : 'ok  '} perfect   ${perfects} perfect and perfect pitches (${perfectMiss} missed), ${sparkles} with the sparkle`);
if (pBad) fails++;
console.log(`\n${pitchNo} pitches, ${inPlays} balls in play, ${challenges} challenges, ${chips} chips, ${OUTINGS} outings, ${fails} growing${errors.length ? ', ' + errors.length + ' page errors' : ''}`);
await browser.close();
server.close();
process.exit(fails || errors.length ? 1 : 0);
