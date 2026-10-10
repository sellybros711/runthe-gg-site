#!/usr/bin/env node
/* Roll-Ball in Chromium: a phone plays a whole daily through the real canvas
 * with real drags, the server replays it and agrees, the result sheet and the
 * share line are right, practice is never posted, and the gate 404s.
 *   node functions/_arcadelab/test/check-browser.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;
import { startDev } from '../build/dev-server.mjs';

const PORT = 8788;
const { server, db } = await startDev(PORT);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: false });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/supabase|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.route(/cdn\.jsdelivr|fonts\.g/, r => r.abort());
  const base = 'http://localhost:' + PORT;
  await page.goto(base + '/arcade/lab/roll-ball/');
  await page.waitForSelector('#bPlay', { timeout: 15000 });
  ok(/hot for \+1 base/.test(await page.textContent('#card')), 'the intro states today\'s rule');
  await page.click('#bPlay');
  const box = await page.locator('#c').boundingBox();
  for (let i = 0; i < 9; i++) {
    await page.waitForFunction(n => document.getElementById('stage').dataset.phase === 'ready' && document.getElementById('hBall').textContent === (n + 1) + '/9', i, { timeout: 15000 });
    const sx = box.x + box.width / 2, sy = box.y + box.height * 0.66;
    await page.mouse.move(sx, sy); await page.mouse.down();
    await page.mouse.move(sx + (i % 3 - 1) * 25, sy + box.height * (0.10 + (i % 4) * 0.04), { steps: 6 });
    if (sy + box.height * 0.22 > box.y + box.height) throw new Error('the pull ran off the screen');
    await page.mouse.up();
    await page.waitForFunction(() => document.getElementById('stage').dataset.phase !== 'ready', null, { timeout: 5000 });
  }
  await page.waitForSelector('#bShare', { timeout: 20000 });
  const card = await page.textContent('#card');
  const run = db.runs[0];
  ok(!!run, 'the daily was filed');
  ok(run && card.includes(run.score + '/36'), 'the screen shows the score the server replayed');
  ok(/gems/.test(card) && /no cash value/.test(card), 'gems are shown and said to have no cash value');
  ok(db.ledger.length === 1, 'gems were paid once');
  await page.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; delete navigator.share; });
  await page.click('#bShare');
  const shared = await page.evaluate(() => window.__copied);
  ok(/^Roll-Ball #\d+ \d+\/36\n[🟩🟨🟧🟥⬛]{9}\nhttps:\/\/runthe\.gg\/arcade\/$/u.test(shared || ''), 'the share line is a header, nine squares and the url');
  await page.screenshot({ path: process.env.SHOT || '/tmp/rollball-over.png' });
  await page.click('#bPrac');
  await page.waitForTimeout(400);
  ok(!(await page.isHidden('#pchip')), 'practice is marked');
  ok(db.runs.length === 1, 'practice is never posted');
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(200); await page.keyboard.up('ArrowRight');
  await page.keyboard.down(' '); await page.waitForTimeout(700); await page.keyboard.up(' ');
  const kb = await page.waitForFunction(() => document.getElementById('stage').dataset.phase !== 'ready', null, { timeout: 3000 }).then(() => true, () => false);
  ok(kb, 'the keyboard aims, charges and rolls');
  await page.goto(base + '/arcade/lab/roll-ball/');
  await page.waitForSelector('#bShare', { timeout: 15000 });
  ok(true, 'coming back today shows the result, not a second play');
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  const r = await page.goto(base + '/arcade/lab/roll-ball/?as=nobody');
  ok(r.status() === 404, 'a non-tester gets the 404 page');
} finally { await browser.close(); server.close(); }
process.exit(fails ? 1 : 0);
