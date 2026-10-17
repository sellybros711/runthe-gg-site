#!/usr/bin/env node
/* 4th and What in Chromium, end to end, the way a thumb plays it.
 *
 *   node 4th-and-what/test/check-browser.mjs [outdir]
 *
 * On a phone (390x844 at 3x) and a desktop (1440x900): pick a distance, try
 * every formation, draw a route, move a receiver, draw a block, set a
 * target, snap it, watch it to the result, go back to the clipboard with the
 * play kept, replay it, then make it a run with the handoff tool and snap
 * that. Fails on any console error or uncaught exception. The site is
 * served from the repo; the CDN and fonts are blocked, which the page must
 * survive (signing in is optional). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const OUT = process.argv[2] || process.env.SHOTS || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://localhost:' + server.address().port;

let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

async function run(name, viewport, scale) {
  console.log('\n' + name);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  const shot = async (f) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '-' + f + '.png') }); };
  const yd = (p) => page.evaluate(q => window.FAW_UI.board().toScreen(q), p);
  const play = () => page.evaluate(() => window.FAW_UI.board().play());
  async function dragYd(from, ...to) {
    const a = await yd(from); await page.mouse.move(a[0], a[1]); await page.mouse.down();
    for (const q of to) { const b = await yd(q); await page.mouse.move(b[0], b[1], { steps: 8 }); }
    await page.mouse.up();
  }
  async function tapYd(p) { const a = await yd(p); await page.mouse.click(a[0], a[1]); }
  async function waitResult() {
    await page.waitForSelector('#result:not([hidden])', { timeout: 30000 });
    return page.evaluate(() => ({ title: document.getElementById('rTitle').textContent, why: document.getElementById('rWhy').textContent, call: document.getElementById('rCall').textContent, dbg: document.getElementById('dbgTxt').textContent }));
  }

  await page.goto(BASE + '/4th-and-what/?seed=11');
  await page.waitForFunction(() => !!window.FAW_UI);
  ok(await page.isVisible('#sPick') && (await page.$$('.dist')).length === 6, 'six distance buttons');
  ok(!(await page.evaluate(() => document.getElementById('guide').open)), 'no guide opens by itself');
  await shot('1-pick');
  await page.click('.dist[data-d="5"]');
  ok(await page.isVisible('#cBoard'), 'the clipboard is up');
  ok((await page.textContent('#downTxt')).trim() === '4th and 5', 'the strip says 4th and 5');
  for (const f of ['gun2x2', 'uc12', 'empty', 'iform', 'gun3x1']) {
    await page.click('.form[data-f="' + f + '"]');
    const box = await page.textContent('#boxTxt');
    ok((await play()).formation === f && /^Box \d$/.test(box), f + ', ' + box);
  }
  ok(await page.isDisabled('#bSnap'), 'Snap It waits for a target or a handoff');

  /* Route: from X up the field and in */
  await dragYd([-13.5, -0.9], [-13.5, 3], [-13.5, 6], [-9, 9]);
  let p = await play();
  ok(p.routes.length === 1 && p.routes[0].who === 'WR1' && p.routes[0].pts.length >= 2, 'a route for X, ' + (p.routes[0] ? p.routes[0].pts.length : 0) + ' points');
  /* extend it from its end */
  const end = p.routes[0].pts[p.routes[0].pts.length - 1];
  await dragYd(end, [end[0] + 3, end[1] + 2], [end[0] + 6, end[1] + 3]);
  p = await play();
  ok(p.routes[0].pts.length > 2, 'the route grows from its end');
  /* the slot's route is number 2 */
  await dragYd([-9.5, -1.6], [-9.5, 2], [-14, 4]);
  p = await play();
  ok(p.routes.length === 2 && p.routes[1].who === 'SLOT', 'routes keep their drawing order');
  /* hold, then drag: move the Z */
  const z = await yd([13.5, -0.9]);
  await page.mouse.move(z[0], z[1]); await page.mouse.down(); await page.waitForTimeout(420);
  const z2 = await yd([11, -1.5]); await page.mouse.move(z2[0], z2[1], { steps: 6 }); await page.mouse.up();
  p = await play();
  ok(p.moved.WR2 && Math.abs(p.moved.WR2[0] - 11) < 0.6, 'held and dragged, Z moves to ' + (p.moved.WR2 || []).map(v => v.toFixed(1)).join(','));
  /* Block: the TE stays in */
  await page.click('.tool[data-tool="block"]');
  await dragYd([-6.2, -1.4], [-5, -2.4]);
  p = await play();
  ok(p.blocks.length === 1 && p.blocks[0].who === 'TE', 'the TE stays in to block');
  /* Target: X first, H the checkdown */
  await page.click('.tool[data-tool="target"]');
  await tapYd([-13.5, -0.9]); await tapYd([-9.5, -1.6]);
  p = await play();
  ok(p.targets.join() === 'WR1,SLOT', 'a star on X and a 2 on H');
  ok(!(await page.isDisabled('#bSnap')), 'Snap It is ready');
  await shot('2-board');
  /* Undo takes the checkdown back, then put it back */
  await page.click('#bUndo'); ok((await play()).targets.join() === 'WR1', 'undo'); await tapYd([-9.5, -1.6]);

  await page.click('#bSnap');
  await page.waitForTimeout(1300);
  await shot('3-live');
  const r1 = await waitResult();
  ok(/^(FIRST DOWN|TOUCHDOWN|TURNOVER ON DOWNS)$/.test(r1.title), 'a result: ' + r1.title);
  ok(r1.why.length > 8 && /^The defense: Cover [0-3] (man|zone), (no )?blitz\./.test(r1.call), 'a reason and the call: ' + r1.why + ' / ' + r1.call);
  ok(/seed 11\b/.test(r1.dbg), 'the debug toggle shows the seed');
  await shot('4-result');
  await page.click('#bShare');
  await page.waitForTimeout(300);
  const shared = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/^4th and What [A-Z ]+[+-]?\d* · 4th and 5\n\S+\nhttps:\/\/runthe\.gg\/4th-and-what$/u.test(shared), 'the share line: ' + shared.split('\n')[0]);
  await page.click('#bBack');
  p = await play();
  ok(await page.isVisible('#cBoard') && p.routes.length === 2 && p.targets.length === 2, 'back to the clipboard with the play kept');
  await page.click('#bSnap');
  await page.click('#bSkip');
  const r2 = await waitResult();
  ok(!!r2.title, 'snapped again and skipped to the end: ' + r2.title);
  await page.click('#bReplay');
  const r3 = await waitResult();
  ok(!!r3.title, 'replay, the defense rolls again: ' + r3.title);

  /* a run: Handoff, QB then the back, then his path */
  await page.click('#bBack');
  await page.click('#bClear');
  await page.click('.tool[data-tool="handoff"]');
  await tapYd([0, -5]); await tapYd([1.8, -5.2]);
  await dragYd([1.8, -5.2], [1.5, -2], [0.8, 1], [0.8, 6]);
  p = await play();
  const pe = p.handoff && p.handoff.path[p.handoff.path.length - 1];
  ok(p.handoff && p.handoff.to === 'RB' && pe && Math.abs(pe[0] - 0.8) < 0.8 && Math.abs(pe[1] - 6) < 0.8, 'a handoff to the back, and the path drawn for him');
  ok(await page.isDisabled('.tool[data-tool="target"]'), 'a run has no target');
  ok(!(await page.isDisabled('#bSnap')), 'a run can be snapped');
  await page.click('#bSnap');
  const r4 = await waitResult();
  ok(!!r4.title, 'the run: ' + r4.title + '. ' + r4.why);
  await shot('5-run');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

await run('phone', { width: 390, height: 844 }, 3);
await run('desktop', { width: 1440, height: 900 }, 1);
await browser.close();
server.close();
console.log(fails ? '\n' + fails + ' failed' : '\nall good');
process.exit(fails ? 1 : 0);
