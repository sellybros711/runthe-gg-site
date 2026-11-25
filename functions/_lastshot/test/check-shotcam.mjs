#!/usr/bin/env node
/* THE 3D SHOT CAM in Chromium (shotcam.js, Phase 2 of the run view), on a
 * phone (390x844). Headless Chromium draws WebGL with SwiftShader, a software
 * renderer, which the gate turns away like any weak device; so the 3D runs
 * here are let through with window.__shotCamOpts = { software: true }.
 *
 *   1. the gate as a player's headless browser meets it: a software renderer
 *      keeps the board, and three.js is never fetched
 *   2. the 3D on a stepped clock (60 frames a second of page time, however
 *      slow the software draws): three.js waits for the clipboard, then the
 *      3D canvas appears at the release and only in the shot span, the read
 *      chip stays clear of the caption, it hands back to the board for the
 *      card, and tap to result is the board's own time to the frame (the
 *      seed 1 win and the seed 5 loss)
 *   3. no WebGL at all: the board, the same timing, no errors
 *   4. reduced motion: the board, never the 3D
 *   5. the watchdog on the real clock: SwiftShader is slow, so whatever rate
 *      it gets, a rate under 40 drops the run to the board and it still ends
 *      on its card. No frame rate is asserted (CI is not a phone).
 * And no console errors anywhere.
 *   node functions/_lastshot/test/check-shotcam.mjs   (SHOTS=dir for screenshots) */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;
import { startDev } from '../build/dev-server.mjs';

const PORT = 8797, base = 'http://localhost:' + PORT;
const SHOTS = process.env.SHOTS || null;
const { server } = await startDev(PORT);
const browser = await chromium.launch(Object.assign({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }, EXE ? { executablePath: EXE } : {}));
let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };
const THREE = /three\.module\.min\.js/;

/* A page on the phone. how: { opts, noGl, reduce, clock } */
async function open(how = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: how.reduce ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errs = [], three = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  page.on('request', r => { if (THREE.test(r.url())) three.push(r.url()); });
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  if (how.opts) await page.addInitScript(o => { window.__shotCamOpts = o; }, how.opts);
  if (how.noGl) await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...a) { return /webgl/.test(kind) ? null : get.call(this, kind, ...a); };
  });
  // every frame the court draws: is the 3D canvas showing, and is the ball up or playing out
  await page.addInitScript(() => {
    window.__seen = [];
    const tick = () => {
      const c = document.querySelector('canvas.shot3d'), s = window.__shotCam, ls = window.__lastShot;
      if (c && s && ls && ls.phase && ls.phase !== 'preview') window.__seen.push({ vis: !c.hidden, span: s.span, on: s.on, sk: s.sk, af: s.after, phase: ls.phase });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  if (how.clock) await page.clock.install();
  await page.goto(base + '/last-shot');
  if (how.clock) { const t = await page.evaluate(() => Date.now()); await page.clock.pauseAt(t + 200); await page.clock.runFor(300); }
  else await page.waitForFunction(() => window.__lastShot && window.__lastShot.view);
  return { ctx, page, errs, three };
}
const status = page => page.evaluate(() => window.__shotCam);
/* Run a seed on a stepped clock to its card: 16 ms of page time a step. */
async function stepped(page, seed, each) {
  await page.evaluate(() => { window.__seen.length = 0; });
  await page.evaluate(s => window.__lastShot.run(s), seed);
  for (let ms = 0; ms < 25000; ms += 16) {
    await page.clock.runFor(16);
    if (each) await each(page);
    if (await page.evaluate(() => !!document.querySelector('#sheet.on'))) break;
  }
  return page.evaluate(() => ({ timing: window.__lastShot.timing, seen: window.__seen.slice(), r: (r => ({ how: r.how, outcome: r.outcome, made: r.shot && r.shot.made }))(window.__lastShot.result) }));
}
/* Wait out the loader on a stepped clock. */
async function settle(page) {
  for (let i = 0; i < 120; i++) { await page.clock.runFor(250); const s = await status(page); if (!['idle', 'loading'].includes(s.state)) return s; }
  return status(page);
}

/* ---------- 1. the gate as headless Chromium meets it ---------- */
console.log('\nthe gate, a software renderer');
{
  const { ctx, page, errs, three } = await open();
  await page.click('#hPlay');
  await page.waitForTimeout(2500);
  const s = await status(page);
  ok(s.state === 'off' && s.why === 'software', 'SwiftShader is a weak device: the board keeps the run (' + s.state + ', ' + s.why + ')');
  await page.evaluate(() => window.__lastShot.run(5));
  await page.waitForSelector('#sheet.on', { timeout: 30000 });
  const seen = await page.evaluate(() => window.__seen);
  ok(seen.length > 20 && seen.every(f => !f.vis), 'the 3D canvas never shows');
  ok(three.length === 0, 'three.js is never fetched');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

/* ---------- 2. the 3D, on a stepped clock ---------- */
console.log('\nthe 3D shot cam (software let through, stepped clock)');
const BASE = {};
{
  // the board's own times first: the same page with the 3D off
  const { ctx, page } = await open({ opts: { off: true }, clock: true });
  await page.click('#hPlay');
  await settle(page);
  for (const seed of [1, 5]) BASE[seed] = (await stepped(page, seed)).timing;
  await ctx.close();
}
{
  const { ctx, page, errs, three } = await open({ opts: { software: true }, clock: true });
  await page.clock.runFor(3000);
  ok(three.length === 0 && (await status(page)).state === 'idle', 'nothing loads on the home screen');
  await page.click('#hPlay');
  const s0 = await settle(page);
  ok(s0.state === 'ready' && three.length === 1, 'on the clipboard three.js comes in and the scene warms (' + s0.state + ', ' + three.length + ' fetch)');
  ok(three.every(u => new URL(u).pathname === '/shut-the-door/3d/vendor/three-0.170.0/three.module.min.js'), 'three.js is Shut The Door\'s vendored copy, by URL');
  for (const [seed, kind] of [[1, 'win'], [5, 'miss']]) {
    let chip = null, pop = null, shot = 0;
    const out = await stepped(page, seed, async pg => {
      const q = await pg.evaluate(() => { const s = window.__shotCam, st = document.getElementById('stage').getBoundingClientRect(), p = document.getElementById('pop');
        const r = p.getBoundingClientRect(), on = getComputedStyle(p).opacity > 0.5;
        return { on: s.on, sk: s.sk, chip: s.chip, pop: on ? { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height } : null }; });
      if (q.on && q.sk != null && q.sk > 0.3 && !chip && q.chip) { chip = q.chip; pop = q.pop; if (SHOTS && !shot++) await pg.screenshot({ path: SHOTS + '/shotcam-' + kind + '.png' }); }
    });
    const seen = out.seen, vis = seen.filter(f => f.vis);
    const st = await status(page);
    ok(kind === 'win' ? out.r.made && out.r.outcome === 'win' : !out.r.made, 'seed ' + seed + ' is the ' + kind + ' (' + JSON.stringify(out.r) + ')');
    ok(vis.length > 30, 'the 3D canvas shows in the shot span (' + vis.length + ' frames)');
    ok(vis.every(f => f.span), 'and only there: never before the release');
    const firstVis = seen.findIndex(f => f.vis), firstUp = seen.findIndex(f => f.span);
    ok(firstVis >= 0 && firstVis - firstUp <= 2, 'the cut comes at the release (frame ' + firstVis + ', ball up at ' + firstUp + ')');
    ok(st.dropped === 0 && st.fps >= 40, 'held its frame rate on page time (' + st.fps + ')');
    ok(!!chip, 'the read chip is up in flight' + (chip ? ': ' + JSON.stringify(chip) : ''));
    if (chip && pop) ok(chip.y + chip.h <= pop.y || chip.y >= pop.y + pop.h || chip.x + chip.w <= pop.x || chip.x >= pop.x + pop.w, 'the chip and the caption do not touch');
    ok(Math.abs(out.timing - BASE[seed]) < 50, 'tap to result is the board\'s: ' + Math.round(out.timing) + ' ms against ' + Math.round(BASE[seed]) + ' ms');
    ok(kind === 'win' ? Math.abs(out.timing - 9200) < 300 : Math.abs(out.timing - 8300) < 300, 'and the retry is as fast as before (' + (kind === 'win' ? '9.2' : '8.3') + ' s)');
    ok(await page.isVisible('#sheet.on') && await page.isVisible('#court'), 'the card comes up on the court');
  }
  // back to the clipboard: the 3D goes with the court
  await page.click('#bBack');
  ok(await page.isHidden('canvas.shot3d') && await page.isHidden('.shotcam'), 'back on the clipboard the 3D canvas and its tag are gone');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

/* ---------- 3. no WebGL ---------- */
console.log('\nno WebGL');
{
  const { ctx, page, errs, three } = await open({ opts: { software: true }, noGl: true, clock: true });
  await page.click('#hPlay');
  const s = await settle(page);
  ok(s.state === 'off' && s.why === 'no-webgl2', 'the gate says no WebGL2 (' + s.why + ')');
  const out = await stepped(page, 1);
  ok(out.seen.length > 30 && out.seen.every(f => !f.vis), 'the board draws the whole run');
  ok(Math.abs(out.timing - BASE[1]) < 50, 'with the same timing (' + Math.round(out.timing) + ' ms)');
  ok(three.length === 0, 'three.js is never fetched');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

/* ---------- 4. reduced motion ---------- */
console.log('\nreduced motion');
{
  const { ctx, page, errs, three } = await open({ opts: { software: true }, reduce: true, clock: true });
  await page.click('#hPlay');
  const s = await settle(page);
  ok(s.state === 'off' && s.why === 'reduced-motion', 'reduced motion keeps the board (' + s.why + ')');
  const out = await stepped(page, 1);
  ok(out.seen.length > 30 && out.seen.every(f => !f.vis), 'never the 3D');
  ok(three.length === 0, 'three.js is never fetched');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

/* ---------- 5. the watchdog, real time ---------- */
console.log('\nthe watchdog (real clock)');
{
  const { ctx, page, errs } = await open({ opts: { software: true } });
  await page.click('#hPlay');
  await page.waitForFunction(() => !['idle', 'loading'].includes(window.__shotCam.state), null, { timeout: 60000 });
  await page.evaluate(() => { window.__seen.length = 0; window.__lastShot.run(1); });
  await page.waitForSelector('#sheet.on', { timeout: 60000 });
  const s = await status(page), seen = await page.evaluate(() => window.__seen);
  ok(s.shown === 1, 'the cut happened');
  if (s.fps != null && s.fps < 40) {
    const lastVis = seen.map(f => f.vis).lastIndexOf(true);
    ok(s.dropped === 1 && /^slow/.test(s.why), 'measured ' + s.fps + ' fps over the first half second: dropped to the board (' + s.why + ')');
    ok(lastVis >= 0 && seen.slice(lastVis + 1).some(f => f.span), 'the board took the rest of the shot span');
  } else ok(s.dropped === 0, 'measured ' + s.fps + ' fps: the 3D kept the run');
  ok(await page.isVisible('#sheet.on'), 'the run still ends on its card');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
