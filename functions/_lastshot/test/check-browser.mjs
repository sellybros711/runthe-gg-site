#!/usr/bin/env node
/* Last Shot in Chromium on a phone (390x844, touch): draw a play with all
 * four tools by pointer, run it, watch it to the result, check the reason,
 * the scheme, the share line and the seed panel, replay, go back to the
 * clipboard with the play kept, and check nothing threw. Then the 404 a
 * non-tester gets.
 *   node functions/_lastshot/test/check-browser.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;
import { startDev } from '../build/dev-server.mjs';

const PORT = 8792, base = 'http://localhost:' + PORT;
const SHOTS = process.env.SHOTS || null;
const { server, setWho } = await startDev(PORT);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let fails = 0;
/* The two banned dashes, built from their code points so this file holds neither. */
const DASHES = new RegExp('[' + String.fromCharCode(8211, 8212) + ']');
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  /* the sign in's CDN and the fonts: not reachable from a check, and not under test here */
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  page.on('pageerror', e => errs.push(String(e)));
  setWho('dev');
  const res = await page.goto(base + '/last-shot');
  ok(res.status() === 200, 'a tester gets the page');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForFunction(() => window.__lastShot && window.__lastShot.view);
  ok(await page.isVisible('#hPlay') && await page.isVisible('#hBooks'), 'home offers the scenario and My Playbooks');
  await page.click('#hPlay');
  await page.waitForSelector('#board', { state: 'visible' });
  ok(await page.isDisabled('#bRun'), 'Run It is disabled with no shooter');

  /* Feet to page pixels through the board's own view. */
  const box = await page.locator('#board').boundingBox();
  const px = async (p) => { const q = await page.evaluate(p => window.__lastShot.view().px(p), p); return [box.x + q.x, box.y + q.y]; };
  const spots = await page.evaluate(() => window.__lastShot.play.spots);
  const drag = async (pts) => {
    let [x, y] = await px(pts[0]); await page.mouse.move(x, y); await page.mouse.down();
    for (const p of pts.slice(1)) { [x, y] = await px(p); await page.mouse.move(x, y, { steps: 6 }); }
    await page.mouse.up();
  };
  const tap = async (p) => { const [x, y] = await px(p); await page.mouse.click(x, y); };
  const tool = async (t) => page.click('[data-tool=' + t + ']');

  // A pin-down drawn by hand: the screener comes down, the shooter comes up off it.
  const s = spots.O4, c = spots.O2;
  await tool('screen');
  await drag([s, { x: (s.x + c.x) / 2, y: s.y + 1 }, { x: c.x - 4, y: c.y - 6 }]);
  await tool('move');
  const end = { x: c.x - 2, y: Math.min(40, c.y + 6) };
  await drag([c, { x: c.x, y: c.y - 9 }, { x: c.x - 4, y: c.y - 4 }, end]);
  await tool('pass');
  await tap(spots.O1);
  await tap(end);
  await tool('shoot');
  await tap(end);
  const steps = await page.evaluate(() => window.__lastShot.play.steps.map(s => s.kind));
  ok(['screen', 'move', 'pass', 'shoot'].every(k => steps.includes(k)), 'all four tools drew a step: ' + steps.join(', '));
  ok(!(await page.isDisabled('#bRun')), 'Run It is enabled once there is a shooter');
  if (SHOTS) await page.screenshot({ path: SHOTS + '/last-shot-board.png' });

  // Undo takes the shot off, and it goes back on.
  await page.click('#bUndo');
  ok(await page.isDisabled('#bRun'), 'Undo removed the shooter');
  await tool('shoot'); await tool('shoot'); await tap(end);

  await page.click('#bRun');
  await page.waitForTimeout(1500);
  const clock = Number(await page.textContent('#clock'));
  ok(clock < 22 && clock > 0, 'the clock is running in tenths: ' + clock);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/last-shot-live.png' });
  await page.waitForSelector('#bShare', { timeout: 40000 });
  const verdict = await page.textContent('.verdict');
  ok(/^(WINNER|LOSE)$/.test(verdict), 'a verdict: ' + verdict);
  ok(/^\d+-\d+$/.test(await page.textContent('#card .finalscore')), 'a final score');
  ok(/Their call on screens: (Switch|Fight over|Go under)\./.test(await page.textContent('.facts')), 'the scheme is revealed');
  const reason = await page.textContent('.reason');
  ok(reason.length > 10 && !DASHES.test(reason), 'a reason with no dashes: ' + reason);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/last-shot-result.png' });

  await page.click('#bSeed');
  ok(/seed \d+/.test(await page.textContent('#seedBox')), 'the seed panel shows the seed');
  await page.click('#bShare');
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  const lines = shared.split('\n');
  ok(lines.length === 3 && /^Last Shot (WINNER|LOSE) \d+-\d+/.test(lines[0]) && lines[2] === 'https://runthe.gg/arcade/', 'the share line: ' + JSON.stringify(shared));
  ok(!/last-shot/.test(shared), 'the share line never links the gated path');

  // The same seed and play give the same result in the page.
  const again = await page.evaluate(() => { const r = window.__lastShot.result; return window.__lastShot.simulate(r.seed); });
  const first = await page.evaluate(() => window.__lastShot.result);
  ok(again.outcome === first.outcome && again.reason === first.reason && again.shotAt === first.shotAt, 'deterministic in the browser');

  await page.click('#bReplay');
  await page.waitForSelector('#bShare', { timeout: 40000 });
  ok(true, 'Replay runs the same play again');
  await page.click('#bBack');
  ok(await page.isVisible('#board') && !(await page.isVisible('#court')), 'Back to Clipboard shows the clipboard');
  const kept = await page.evaluate(() => window.__lastShot.play.steps.length);
  ok(kept === steps.length, 'the play is kept for editing');
  await page.click('#bClear');
  ok((await page.evaluate(() => window.__lastShot.play.steps.length)) === 0 && await page.isDisabled('#bRun'), 'Clear empties the clipboard');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));

  // Everybody else.
  setWho(null);
  const nobody = await page.goto(base + '/last-shot');
  ok(nobody.status() === 404, 'a non-tester gets a 404');
  ok((await page.content()).includes('<title>') && !(await page.content()).includes('Last Shot'), 'the 404 page never names the game');
  const mod = await page.goto(base + '/last-shot/m/sim.js');
  ok(mod.status() === 404, 'a non-tester cannot load a module');
} finally {
  await browser.close(); server.close();
}
console.log(fails ? fails + ' failed' : 'all good');
process.exit(fails ? 1 : 0);
