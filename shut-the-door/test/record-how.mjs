/* Records the how to play clips from the real game (the owner, 2026-11-02: "show each control with a
 * looped animation ... recorded from the real game").
 *
 *   node shut-the-door/test/record-how.mjs <base url> <theme: light|dark> <out dir> [only,clips]
 *
 * <base url> serves the site root (python3 -m http.server). Chromium at 390x844.
 *
 * HOW. Frame by frame on Playwright's clock: the page loads in real time, then for each clip the
 * clock is paused and stepped 1000/FPS ms a frame with a screenshot of the clip's crop. A tap lands
 * between two frames and a drag spans several, so a software renderer (where one click can take
 * seconds) still gives a clip at the game's own speed. (Real time screencast was tried first: on a
 * software renderer a four second action came out as a four minute video.)
 *
 * ffmpeg writes an mp4 (H.264) and a webm (VP9) 540 px wide, and the clip's first frame is its poster
 * (webp). Every file lands in <out dir> as <clip>-<theme>.<ext>. A clip over about 300 KB is said.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = (() => { try { return require('/opt/node-tools/node_modules/playwright'); } catch (e) { return require('playwright'); } })();
const [BASE, THEME, OUT, ONLY] = process.argv.slice(2);
if (!BASE || !THEME || !OUT) { console.error('usage: record-how.mjs <base url> <light|dark> <out dir> [clips]'); process.exit(2); }
const W = 390, H = 844, OUT_W = 540, FPS = 15, DPR = Number(process.env.DPR || 2);
const only = ONLY ? new Set(ONLY.split(',')) : null;
const want = (k) => !only || only.has(k);
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await pw.chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const origin = new URL(BASE).origin;

async function open({ day, query = '', video = false, dpr = DPR, meter = true }) {
  const vdir = fs.mkdtempSync(path.join(OUT, '.v-'));
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, colorScheme: THEME, isMobile: true, hasTouch: true,
    ...(video ? { recordVideo: { dir: vdir, size: { width: W * 2, height: H * 2 } } } : {}) });
  await ctx.route((u) => u.origin !== origin, (r) => {
    const h = new URL(r.request().url()).hostname;
    if (/fonts\.(googleapis|gstatic)\.com$/.test(h)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return r.abort();
  });
  await ctx.addInitScript(([t, m]) => { try { localStorage.setItem('runthegrid_theme', t); localStorage.setItem('std_meter_taps_v2', '0'); if (!m) localStorage.setItem('std_ui_v1', JSON.stringify({ meter: false })); } catch (e) {} }, [THEME, meter]);
  const page = await ctx.newPage();
  const t0 = Date.now();
  page.setDefaultTimeout(180000);
  await page.clock.install({ time: new Date(day + 'T16:00:00Z') });
  await page.goto(BASE.replace(/\/$/, '') + '/shut-the-door/' + query, { waitUntil: 'commit', timeout: 90000 });
  await page.waitForSelector('#h-main:not([hidden])', { timeout: 300000 });
  await page.waitForFunction(() => !(window.STD_STAGE && window.STD_STAGE.supported()) || (window.STD_STAGE.current && window.STD_STAGE.current.loaded), null, { timeout: 600000 });
  await page.click('#b-take', { timeout: 300000 });
  await page.waitForSelector('#m-arsenal .pitch', { state: 'visible', timeout: 300000 });
  await page.waitForTimeout(3000);
  return { ctx, page, t0, vdir, cuts: [], cdp: await ctx.newCDPSession(page) };
}
const box = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
async function crop(page, topSel, botSel, pad = 10) {
  const a = await box(page, topSel), b = await box(page, botSel);
  const y = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad)), y1 = Math.min(H, Math.ceil(Math.max(a.y + a.h, b.y + b.h) + pad));
  return { x: 0, y, width: W, height: (y1 - y) - ((y1 - y) % 2) };
}
const kb = (f) => Math.round(fs.statSync(f).size / 1024);
function encode(name, input, pre, vf) {
  const base = path.join(OUT, name + '-' + THEME);
  const chain = vf + `scale=${OUT_W}:-2:flags=lanczos,fps=${FPS},format=yuv420p`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...pre, '-i', input, '-vf', chain, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '30', '-movflags', '+faststart', '-an', base + '.mp4']);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...pre, '-i', input, '-vf', chain, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '44', '-row-mt', '1', '-an', base + '.webm']);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', base + '.mp4', '-frames:v', '1', '-quality', '80', base + '.webp']);
  const big = Math.max(kb(base + '.mp4'), kb(base + '.webm')) > 300 ? '  OVER 300 KB' : '';
  console.log(`${name}-${THEME}: mp4 ${kb(base + '.mp4')} KB, webm ${kb(base + '.webm')} KB, poster ${kb(base + '.webp')} KB${big}`);
}
/* a clip: the clock paused, then each step (a thing to do, then a hold in seconds) frame by frame */
async function clip(S, name, c, steps) {
  const page = S.page, dir = fs.mkdtempSync(path.join(OUT, '.f-'));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5000));   // a lead the call's round trip cannot eat
  let n = 0;
  const t = Date.now();
  /* the DevTools capture, not page.screenshot: that one waits on the page's animation frame, which the
     paused clock holds, so it never came back */
  S.frame = async () => {
    await page.clock.runFor(1000 / FPS);
    const r = await S.cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: c.x, y: c.y, width: c.width, height: c.height, scale: DPR } });
    fs.writeFileSync(path.join(dir, String(n++).padStart(4, '0') + '.png'), Buffer.from(r.data, 'base64'));
  };
  for (const [act, hold] of steps) { if (act) await act(); for (let i = 0; i < Math.round(hold * FPS); i++) await S.frame(); }
  await page.clock.resume();
  S.frame = null;
  encode(name, path.join(dir, '%04d.png'), ['-framerate', String(FPS)], '');
  console.log(`  ${n} frames in ${Math.round((Date.now() - t) / 1000)} s`);
  fs.rmSync(dir, { recursive: true, force: true });
}
async function close(S) {
  await S.ctx.close();
  fs.rmSync(S.vdir, { recursive: true, force: true });
}
const tap = (page, sel) => async () => { await page.click(sel); };
const tapCell = (page, cell, u = 0.5, v = 0.5) => async () => {
  const r = await box(page, `#m-aim .cell[data-cell="${cell}"]`);
  await page.mouse.click(r.x + r.w * u, r.y + r.h * v);
};
/* a drag across the zone over about two thirds of a second, a frame at each move */
const dragZone = (S, from, to) => async () => {
  const page = S.page, a = await box(page, `#m-aim .cell[data-cell="${from}"]`), b = await box(page, `#m-aim .cell[data-cell="${to}"]`);
  await page.mouse.move(a.x + a.w / 2, a.y + a.h / 2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(a.x + a.w / 2 + (b.x - a.x) * i / 10, a.y + a.h / 2 + (b.y - a.y) * i / 10); await S.frame(); }
  await page.mouse.up();
};
const idle = (page) => page.waitForFunction(() => !window.STD_UI.state.busy, null, { timeout: 300000 });
/* a pitch thrown to get on with it, the meter stopped twice if it is on */
async function throwOne(page, cell, type = 0) {
  await page.click(`#m-arsenal .pitch >> nth=${type}`); await tapCell(page, cell)();
  await page.click('#m-throw');
  for (let i = 0; i < 2; i++) if (await page.isVisible('#m-meter:not(.is-done)')) { await page.waitForTimeout(500); await page.click('#m-meter').catch(() => {}); }
}

/* ---- the clips on a day with nobody on (2026-11-01) ---- */
if (['aim', 'power', 'release', 'reaim', 'scout'].some(want)) {
  const S = await open({ day: '2026-11-01' });
  const page = S.page;
  const zd = await crop(page, '#m-aim', '#m-dock');
  if (want('aim')) await clip(S, 'aim', zd, [
    [null, 0.4], [tap(page, '#m-arsenal .pitch >> nth=1'), 0.6], [tapCell(page, 17, 0.3, 0.6), 0.7],
    [dragZone(S, 17, 8), 0.5], [tap(page, '#m-arsenal .pitch >> nth=0'), 0.7],
  ]);
  await page.click('#m-arsenal .pitch >> nth=0'); await tapCell(page, 12)();
  const zm = await crop(page, '#m-aim', '#m-dock');
  if (want('power') || want('release')) {
    if (want('power')) await clip(S, 'power', zm, [[null, 0.3], [tap(page, '#m-throw'), 1.1], [tap(page, '#m-meter'), 0.9]]);
    else { await page.click('#m-throw'); await page.waitForTimeout(900); await page.click('#m-meter'); }
    if (want('release')) await clip(S, 'release', zm, [[null, 1.1], [tap(page, '#m-meter'), 1.3]]);
    else await page.click('#m-meter');
    await idle(page);
  }
  if (want('reaim')) {
    await page.click('#m-arsenal .pitch >> nth=0'); await tapCell(page, 12)();
    await clip(S, 'reaim', zm, [[null, 0.3], [tap(page, '#m-throw'), 0.9], [tap(page, '#m-meter .rm-back'), 0.6], [tapCell(page, 6, 0.4, 0.4), 1.0]]);
  }
  if (want('scout')) {
    const c = await crop(page, '#m-card', '#m-aim', 8);
    await clip(S, 'scout', c, [
      [null, 0.4], [tap(page, '#m-drawer-b'), 1.1], [tap(page, '#m-heat [data-heat="swing"]'), 1.1],
      [tap(page, '#m-heat [data-heat="damage"]'), 0.7], [tap(page, '#m-drawer-b'), 0.6],
    ]);
  }
  await close(S);
}

/* ---- CHALLENGE: pitches near the edge until a called ball can be challenged (?mockAbs=miss: the
   mock's umpire calls a take near the edge the wrong way, a state a real outing rarely reaches) ---- */
if (want('challenge')) {
  const S = await open({ day: '2026-11-01', query: '?mockAbs=miss', meter: false });
  const page = S.page;
  let live = false;
  for (let i = 0; i < 20 && !live; i++) {
    await throwOne(page, [3, 11, 13, 21, 1, 23][i % 6]);
    await page.waitForFunction(() => !window.STD_UI.state.busy || !document.getElementById('m-abs-b').hidden, null, { timeout: 300000 });
    live = await page.isVisible('#m-abs-b');
    if (!live) await idle(page);
    if (await page.evaluate(() => window.STD_UI.state.outing.status !== 'live')) break;
  }
  if (live) await clip(S, 'challenge', await crop(page, '#m-aim', '#m-dock'), [[null, 0.8], [tap(page, '#m-abs-b'), 2.6]]);
  else console.log('challenge: none came up in 20 pitches');
  await close(S);
}

/* ---- QUICK DELIVERY and PICKOFF on a day that starts with a runner on (2026-10-30) ---- */
if (want('quick')) {
  const S = await open({ day: '2026-10-30' });
  const page = S.page;
  await clip(S, 'quick', await crop(page, '#m-run', '#m-dock', 8), [[null, 0.5], [tap(page, '#m-quick'), 1.1], [tap(page, '#m-quick'), 0.9]]);
  await close(S);
}
if (want('pickoff')) {
  const S = await open({ day: '2026-10-30' });
  const page = S.page;
  for (let i = 0; i < 4 && !(await page.isVisible('#m-po')); i++) { await throwOne(page, 22, 1); await idle(page); }
  if (await page.isVisible('#m-po')) await clip(S, 'pickoff', { x: 0, y: 0, width: W, height: H }, [[null, 0.4], [tap(page, '#m-po'), 3.6]]);
  else console.log('pickoff: no pickoff came up');
  await close(S);
}
await browser.close();
