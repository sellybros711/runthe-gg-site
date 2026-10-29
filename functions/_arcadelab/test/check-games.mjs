#!/usr/bin/env node
/* Every Arcade Lab game in Chromium on a phone: start the daily, play it to
 * the end with real pointer and key input, and check the server filed the
 * run it replayed, the share line, the board and that nothing threw. Then
 * the admin page for an admin, and the 404 for everybody else.
 *   node functions/_arcadelab/test/check-games.mjs [game ...] */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;
import { startDev } from '../build/dev-server.mjs';

const PORT = 8789, base = 'http://localhost:' + PORT;
const SHOTS = process.env.SHOTS || '/tmp';
const { server, db } = await startDev(PORT);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* The run is over once the result sheet is up; never press anything after,
   or the next press lands on the sheet's own buttons. */
const over = page => page.isVisible('#bShare');

/* How each game is played by a hand that does not read the screen well. */
const PLAY = {
  async 'field-goal-flick'(page, b) {
    for (let i = 0; i < 5; i++) {
      await page.waitForFunction(() => document.getElementById('stage').dataset.phase === 'ready' || !!document.getElementById('bShare'), null, { timeout: 15000 });
      if (await over(page)) return;
      const x = b.x + b.width / 2, y = b.y + b.height * 0.85;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + 6, y - b.height * 0.45, { steps: 4 }); await page.mouse.up();
      await sleep(300);
    }
  },
  async 'hoop-shoot'(page, b) {
    const end = Date.now() + 66000;
    while (Date.now() < end && !(await over(page))) {
      const x = b.x + b.width / 2, y = b.y + b.height * 0.85;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + 3, y - b.height * 0.35, { steps: 3 }); await page.mouse.up();
      await sleep(450);
    }
  },
  async whack(page, b) {
    const end = Date.now() + 80000; let i = 0;
    while (Date.now() < end && !(await over(page))) {
      await page.mouse.click(b.x + b.width * (0.2 + 0.3 * (i % 3)), b.y + b.height * (0.3 + 0.22 * ((i / 3 | 0) % 3)));
      i++; await sleep(230);
    }
  },
  async 'drop-board'(page, b) {
    for (let i = 0; i < 5; i++) {
      await page.waitForFunction(() => document.getElementById('stage').dataset.phase === 'ready' || !!document.getElementById('bShare'), null, { timeout: 30000 });
      if (await over(page)) return;
      await page.mouse.click(b.x + b.width * (0.25 + 0.12 * i), b.y + b.height * 0.1);
      await sleep(400);
    }
  },
  async pinball(page, b) {
    const end = Date.now() + 240000; let t = 0;
    while (Date.now() < end && !(await over(page))) {
      if (await over(page)) break;
      await page.keyboard.down('Space'); await sleep(500); await page.keyboard.up('Space');
      // flap both flippers now and then, with a finger
      for (let k = 0; k < 6 && !(await over(page)); k++) {
        await page.mouse.click(b.x + b.width * (t++ % 2 ? 0.75 : 0.25), b.y + b.height * 0.85);
        await sleep(400);
      }
    }
  }
};

const only = process.argv.slice(2);
try {
  for (const [id, play] of Object.entries(PLAY)) {
    if (only.length && !only.includes(id)) continue;
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/supabase|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
    await page.route(/cdn\.jsdelivr|fonts\.g/, r => r.abort());
    await page.goto(base + '/arcade/lab/' + id + '/?as=dev');
    await page.waitForSelector('#bPlay', { timeout: 15000 });
    ok(/TESTERS ONLY/.test(await page.content()), id + ': marked testers only');
    await page.click('#bPlay');
    await sleep(300);
    const b = await page.locator('#c').boundingBox();
    const t0 = Date.now();
    await play(page, b);
    const done = await page.waitForSelector('#bShare', { timeout: 120000 }).then(() => true, () => false);
    ok(done, id + ': the run ends on the result in ' + Math.round((Date.now() - t0) / 1000) + 's');
    const run = db.runs.find(r => r.game_id === id);
    ok(!!run, id + ': the server replayed and filed it' + (run ? ' (' + run.score + ')' : ''));
    await page.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; delete navigator.share; });
    await page.click('#bShare');
    const shared = await page.evaluate(() => window.__copied) || '';
    ok(/ #\d+ /.test(shared) && /https:\/\/runthe\.gg\/arcade\/$/.test(shared), id + ': share line ' + JSON.stringify(shared.split('\n').slice(0, 2).join(' / ')));
    ok(/Today's board/.test(await page.textContent('#card')), id + ': the board shows');
    await page.screenshot({ path: SHOTS + '/lab-' + id + '.png' });
    ok(!errors.length, id + ': no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    const r = await page.goto(base + '/arcade/lab/' + id + '/?as=nobody');
    ok(r.status() === 404, id + ': a non-tester gets the 404');
    await page.close();
  }
  if (!only.length || only.includes('admin')) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route(/cdn\.jsdelivr|fonts\.g/, r => r.abort());
    ok((await page.goto(base + '/arcade/lab/admin/?as=dev')).status() === 404, 'admin: a tester gets the 404');
    ok((await page.goto(base + '/arcade/lab/admin/?as=boss')).status() === 200, 'admin: an admin gets the page');
    await page.waitForSelector('#bDraft', { timeout: 15000 });
    await page.click('#bNew'); await page.click('#bVal');
    await page.waitForSelector('#vr ul, #vr p', { timeout: 15000 });
    ok(/Needs at least/.test(await page.textContent('#vr')), 'admin: the validator says why a prompt fails, in words');
    await page.screenshot({ path: SHOTS + '/lab-admin.png', fullPage: true });
    ok(!errors.length, 'admin: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await page.close();
  }
} finally { await browser.close(); server.close(); }
process.exit(fails ? 1 : 0);
