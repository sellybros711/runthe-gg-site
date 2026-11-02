/* Records the how to play clips from the real game (the owner, 2026-11-02: "show each control with a
 * looped animation ... recorded from the real game").
 *
 *   node shut-the-door/test/record-how.mjs <base url> <theme: light|dark> <out dir> [only,clips]
 *
 * <base url> serves the site root (python3 -m http.server). Chromium at 390x844, device scale 2.
 * Each clip is recorded frame by frame on Playwright's clock: the page loads in real time, then the
 * clock is paused and stepped 1000/FPS ms a frame with a screenshot of the clip's crop, so a slow
 * software renderer still gives an even clip. ffmpeg then writes an mp4 (H.264) and a webm (VP9), and
 * the first frame is the poster (webp). Every file lands in <out dir> as <clip>-<theme>.<ext>.
 *
 * The clips: aim (a pitch and a spot), power (the power stop), release (the ring), reaim, scout,
 * challenge (?mockAbs=miss, where a take near the edge is called wrong, so a challenge can come up),
 * quick (QUICK DELIVERY) and pickoff, the last two on a day that starts with a runner on.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = (() => { try { return require('/opt/node-tools/node_modules/playwright'); } catch (e) { return require('playwright'); } })();
const [BASE, THEME, OUT, ONLY] = process.argv.slice(2);
if (!BASE || !THEME || !OUT) { console.error('usage: record-how.mjs <base url> <light|dark> <out dir> [clips]'); process.exit(2); }
const FPS = 24, STEP = 1000 / FPS, W = 390, H = 844, DPR = 2, OUT_W = 540;
const only = ONLY ? new Set(ONLY.split(',')) : null;
const want = (k) => !only || only.has(k);
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await pw.chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

/* the day that leads off with a hitter and no runner (2026-11-01), and one with a runner on (2026-10-30) */
async function open({ day, query = '' }) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, colorScheme: THEME });
  const origin = new URL(BASE).origin;
  await ctx.route((u) => u.origin !== origin, (r) => { const h = new URL(r.request().url()).hostname; if (/fonts\.(googleapis|gstatic)\.com$/.test(h)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' }); if (/googlesyndication\.com$/.test(h)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); return r.abort(); });
  await ctx.addInitScript((t) => { try { localStorage.setItem('runthegrid_theme', t); localStorage.setItem('std_meter_taps_v2', '0'); } catch (e) {} }, THEME);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(day + 'T16:00:00Z') });
  await page.goto(BASE.replace(/\/$/, '') + '/shut-the-door/' + query, { waitUntil: 'commit', timeout: 90000 });
  await page.waitForSelector('#h-main:not([hidden])', { timeout: 120000 });
  await page.waitForFunction(() => !(window.STD_STAGE && window.STD_STAGE.supported()) || (window.STD_STAGE.current && window.STD_STAGE.current.loaded), null, { timeout: 600000 });
  await page.click('#b-take', { timeout: 300000 });
  await page.waitForSelector('#m-arsenal .pitch', { state: 'visible', timeout: 300000 });
  await page.waitForTimeout(2500);
  return { ctx, page };
}
const box = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
/* a crop from the top of one element to the bottom of another, the full width, inside the viewport */
async function crop(page, topSel, botSel, pad = 10) {
  const a = await box(page, topSel), b = await box(page, botSel);
  const y = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad)), y1 = Math.min(H, Math.ceil(Math.max(a.y + a.h, b.y + b.h) + pad));
  return { x: 0, y, width: W, height: (y1 - y) - ((y1 - y) % 2) };
}

/* the frames of one clip: run the steps, each a thing to do and how many frames to hold after it */
async function record(name, page, clip, steps) {
  const dir = fs.mkdtempSync(path.join(OUT, '.f-' + name + '-'));
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));
  let n = 0;
  const frame = async () => { await page.clock.runFor(STEP); await page.screenshot({ path: path.join(dir, String(n++).padStart(4, '0') + '.png'), clip }); };
  for (const [act, hold] of steps) {
    if (act) await act();
    for (let i = 0; i < hold; i++) await frame();
  }
  await page.clock.resume();
  const base = path.join(OUT, name + '-' + THEME);
  const vf = `scale=${OUT_W}:-2:flags=lanczos`;
  const inArgs = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%04d.png')];
  execFileSync('ffmpeg', [...inArgs, '-vf', vf + ',format=yuv420p', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '30', '-movflags', '+faststart', '-an', base + '.mp4']);
  execFileSync('ffmpeg', [...inArgs, '-vf', vf + ',format=yuv420p', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-an', base + '.webm']);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, '0000.png'), '-vf', vf, '-quality', '80', base + '.webp']);
  fs.rmSync(dir, { recursive: true, force: true });
  const kb = (f) => Math.round(fs.statSync(f).size / 1024);
  console.log(`${name}-${THEME}: ${n} frames, mp4 ${kb(base + '.mp4')} KB, webm ${kb(base + '.webm')} KB, poster ${kb(base + '.webp')} KB`);
}
const s = (sec) => Math.round(sec * FPS);
const tap = (page, sel) => async () => { await page.click(sel, { timeout: 20000 }); };
/* a tap on the zone at a point in a cell (u, v in 0..1 of the cell), a finger rather than a cursor */
const tapCell = (page, cell, u = 0.5, v = 0.5) => async () => {
  const r = await box(page, `#m-aim .cell[data-cell="${cell}"]`);
  await page.mouse.click(r.x + r.w * u, r.y + r.h * v);
};
const dragZone = (page, from, to) => async () => {
  const a = await box(page, `#m-aim .cell[data-cell="${from}"]`), b = await box(page, `#m-aim .cell[data-cell="${to}"]`);
  await page.mouse.move(a.x + a.w / 2, a.y + a.h / 2); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(a.x + a.w / 2 + (b.x - a.x) * i / 8, a.y + a.h / 2 + (b.y - a.y) * i / 8); await page.clock.runFor(STEP); }
  await page.mouse.up();
};
const idle = (page) => page.waitForFunction(() => !window.STD_UI.state.busy, null, { timeout: 180000 });
const cancelMeter = async (page) => { if (await page.isVisible('#m-meter .rm-back')) { await page.click('#m-meter .rm-back'); await page.waitForTimeout(200); } };

/* ---- the clips on a day with nobody on ---- */
if (['aim', 'power', 'release', 'reaim', 'scout'].some(want)) {
  const { ctx, page } = await open({ day: '2026-11-01' });
  const zoneDock = () => crop(page, '#m-aim', '#m-dock');
  if (want('aim')) await record('aim', page, await zoneDock(), [
    [null, s(0.4)], [tap(page, '#m-arsenal .pitch >> nth=1'), s(0.6)], [tapCell(page, 17, 0.3, 0.6), s(0.7)],
    [dragZone(page, 17, 8), s(0.9)], [tap(page, '#m-arsenal .pitch >> nth=0'), s(0.6)],
  ]);
  if (want('power') || want('release')) {
    await page.click('#m-arsenal .pitch >> nth=0'); await tapCell(page, 12)();
    const c = await crop(page, '#m-aim', '#m-dock');
    if (want('power')) await record('power', page, c, [
      [null, s(0.3)], [tap(page, '#m-throw'), s(0.9)], [tap(page, '#m-meter'), s(1.0)],
    ]);
    else { await page.click('#m-throw'); await page.waitForTimeout(800); await page.click('#m-meter'); }
    if (want('release')) await record('release', page, c, [[null, s(0.8)], [tap(page, '#m-meter'), s(1.2)]]);
    else await page.click('#m-meter');
    await idle(page);
  }
  if (want('reaim')) {
    await page.click('#m-arsenal .pitch >> nth=0'); await tapCell(page, 12)();
    await record('reaim', page, await zoneDock(), [
      [null, s(0.3)], [tap(page, '#m-throw'), s(0.8)], [tap(page, '#m-meter .rm-back'), s(0.6)], [tapCell(page, 6, 0.4, 0.4), s(1.0)],
    ]);
  }
  if (want('scout')) await record('scout', page, await crop(page, '#m-card', '#m-aim', 8), [
    [null, s(0.4)], [tap(page, '#m-drawer-b'), s(1.0)], [tap(page, '#m-heat [data-heat="swing"]'), s(1.0)],
    [tap(page, '#m-heat [data-heat="damage"]'), s(0.6)], [tap(page, '#m-drawer-b'), s(0.6)],
  ]);
  await ctx.close();
}

/* ---- CHALLENGE: throw until a called ball can be challenged (the mock's umpire misses near the edge) ---- */
if (want('challenge')) {
  const { ctx, page } = await open({ day: '2026-11-01', query: '?mockAbs=miss' });
  await page.evaluate(() => { try { const p = JSON.parse(localStorage.getItem('std_ui_v1') || '{}'); } catch (e) {} });
  let live = false;
  for (let i = 0; i < 30 && !live; i++) {
    await page.click('#m-arsenal .pitch >> nth=0'); await tapCell(page, [3, 11, 13, 21, 1][i % 5])();
    await page.click('#m-throw');
    if (await page.isVisible('#m-meter')) { await page.waitForTimeout(500); await page.click('#m-meter'); if (await page.isVisible('#m-meter:not(.is-done)')) { await page.waitForTimeout(400); await page.click('#m-meter'); } }
    await page.waitForFunction(() => !window.STD_UI.state.busy || !document.getElementById('m-abs-b').hidden, null, { timeout: 180000 });
    live = await page.isVisible('#m-abs-b');
    if (!live) await idle(page);
    if (await page.evaluate(() => window.STD_UI.state.outing.status !== 'live')) break;
  }
  if (live) await record('challenge', page, await crop(page, '#m-aim', '#m-dock'), [[null, s(0.7)], [tap(page, '#m-abs-b'), s(2.2)]]);
  else console.log('challenge: no challenge came up in 30 pitches');
  await ctx.close();
}

/* ---- QUICK DELIVERY and PICKOFF, on a day with a runner on ---- */
if (want('quick') || want('pickoff')) {
  const { ctx, page } = await open({ day: '2026-10-30' });
  /* the pickoff is live after a pitch here */
  for (let i = 0; i < 4 && !(await page.isVisible('#m-po')); i++) {
    await page.click('#m-arsenal .pitch >> nth=1'); await tapCell(page, 22)();
    await page.click('#m-throw');
    if (await page.isVisible('#m-meter')) { await page.waitForTimeout(500); await page.click('#m-meter'); await page.waitForTimeout(400); if (await page.isVisible('#m-meter:not(.is-done)')) await page.click('#m-meter'); }
    await idle(page);
  }
  if (want('quick')) await record('quick', page, await crop(page, '#m-run', '#m-dock', 8), [
    [null, s(0.5)], [tap(page, '#m-quick'), s(1.0)], [tap(page, '#m-quick'), s(0.8)],
  ]);
  if (want('pickoff') && await page.isVisible('#m-po')) {
    const c = { x: 0, y: 0, width: W, height: H - (H % 2) };
    const steps = [[null, s(0.5)], [tap(page, '#m-po'), s(3.6)]];
    await record('pickoff', page, c, steps);
  }
  await ctx.close();
}
await browser.close();
