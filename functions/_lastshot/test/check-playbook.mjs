#!/usr/bin/env node
/* My Playbooks and the storyboard, in Chromium, on a phone (390x844, touch)
 * and a desktop (1440x900). The account is a stand in and the cloud saves are
 * in memory, so no check ever writes a row on a real account.
 *
 *   node functions/_lastshot/test/check-playbook.mjs   (SHOTS=dir for screenshots) */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;
import { startDev } from '../build/dev-server.mjs';

const PORT = 8793, BASE = 'http://localhost:' + PORT;
const OUT = process.env.SHOTS || null;
const { server } = await startDev(PORT);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };

async function run(name, viewport, mobile) {
  console.log('\n' + name);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile, acceptDownloads: true });
  /* THE CLOUD, IN MEMORY. assets/cloudsave.js steps aside when RTG_SAVE is already there. */
  await ctx.addInitScript(() => {
    const mem = {}; window.__mem = mem;
    window.RTG_SAVE = { API_VERSION: 1, idle: () => true, signedIn: () => true,
      all: g => Promise.resolve(Object.keys(mem).filter(k => k.startsWith(g + '/')).map(k => ({ slot: k.split('/')[1], progress: mem[k].progress, payload: JSON.parse(JSON.stringify(mem[k].payload)) }))),
      queue: (g, sl, fn) => { const m = fn(); const k = g + '/' + sl; if (!m) return Promise.resolve(null);
        if (mem[k] && mem[k].progress > m.progress) return Promise.resolve({ ok: false, payload: mem[k].payload, progress: mem[k].progress });
        mem[k] = { progress: m.progress, payload: JSON.parse(JSON.stringify(m.payload)) }; return Promise.resolve({ ok: true }); },
      drop: (g, sl) => { delete mem[g + '/' + sl]; return Promise.resolve(null); } };
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Elevator' : undefined));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  const shot = async f => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '-' + f + '.png') }); };
  const L = fn => page.evaluate(fn);

  await page.goto(BASE + '/last-shot');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForFunction(() => window.__lastShot && window.__lastShot.books);
  await shot('0-home');

  /* drawing helpers, in feet, through the board's own view */
  const px = async p => { const box = await page.locator('#board').boundingBox(); const q = await page.evaluate(p => window.__lastShot.view().px(p), p); return [box.x + q.x, box.y + q.y]; };
  const drag = async pts => { let [x, y] = await px(pts[0]); await page.mouse.move(x, y); await page.mouse.down(); for (const p of pts.slice(1)) { [x, y] = await px(p); await page.mouse.move(x, y, { steps: 6 }); } await page.mouse.up(); };
  const tap = async p => { const [x, y] = await px(p); await page.mouse.click(x, y); };
  const tool = async t => { const on = await page.getAttribute('[data-tool=' + t + ']', 'aria-pressed'); if (on !== 'true') await page.click('[data-tool=' + t + ']'); };
  /* A pin-down in three frames: 1 kills clock, 5 pins down for 2, 1 hits 2 for the shot. */
  async function drawPin() {
    const sp = await L(() => window.__lastShot.play.spots);
    await tool('move'); await drag([sp.O1, { x: 40, y: 31 }, { x: 12, y: 33 }, { x: 28, y: 32 }]);
    await page.click('#bNext');
    await tool('screen'); await drag([sp.O5, { x: 34, y: 14 }, { x: 35, y: 10.5 }]);
    await tool('move'); await drag([sp.O2, { x: 33.5, y: 9 }, { x: 38, y: 14 }, { x: 43, y: 23 }]);
    await page.click('#bNext');
    await tool('pass'); await tap({ x: 28, y: 32 }); await tap({ x: 43, y: 23 });
    await tool('shoot'); await tap({ x: 43, y: 23 });
  }

  /* ---------- the storyboard, in the game ---------- */
  await page.click('#hPlay');
  await page.waitForSelector('#board', { state: 'visible' });
  await drawPin();
  const beats = await L(() => window.__lastShot.play.steps.map(s => s.kind + s.beat));
  ok(JSON.stringify(beats) === JSON.stringify(['move1', 'screen2', 'move2', 'pass3', 'shoot3']), 'the storyboard keeps each step in its frame: ' + beats.join(' '));
  ok((await page.locator('#frames .fr').count()) === 3, 'three frames in the strip');
  ok(!(await page.isDisabled('#bRun')), 'Run It is ready');
  await shot('1-frame3');
  await page.click('#frames .fr[data-beat="2"]');
  ok(await L(() => window.__lastShot.board.beat) === 2, 'tap a frame to go back to it');
  await shot('2-frame2');
  await page.click('#bFrame');
  ok(await page.isVisible('#court'), 'Play frame runs the frame on the court');
  await page.waitForSelector('#board', { state: 'visible', timeout: 15000 });
  ok(true, 'and comes back to the clipboard');
  await page.click('#bUndo');
  ok((await L(() => window.__lastShot.play.steps.filter(s => s.beat === 2).length)) === 1, 'Undo takes back the last step of the frame on show');
  await tool('move'); { const sp = await L(() => window.__lastShot.play.steps); void sp; }
  await drag([{ x: 32, y: 6.5 }, { x: 33.5, y: 9 }, { x: 38, y: 14 }, { x: 43, y: 23 }]);
  ok((await L(() => window.__lastShot.play.steps.map(s => s.beat).join(''))) === '12233', 'a step drawn on frame 2 joins frame 2');

  /* ---------- My Playbooks, signed out ---------- */
  await page.click('#back');
  await page.click('#hBooks');
  await page.waitForSelector('#pbSignIn');
  ok(await page.isVisible('#pbSignIn'), 'signed out, My Playbooks offers sign in and keeps nothing');
  ok(!(await page.isVisible('#pbNew')), 'and no playbook can be started');

  /* ---------- signed in ---------- */
  await L(() => { const A = window.RTG_AUTH || (window.RTG_AUTH = {}); A.boot = () => true; A.state = () => ({ ready: true, resolved: true, signedIn: true, userId: 'check-user' }); A.onChange = f => f(A.state()); A.token = () => 'check'; });
  await page.click('#back');
  await page.click('#hBooks');
  await page.waitForSelector('#pbNew');
  await page.click('#pbNew');
  await page.fill('#pbName', 'Varsity');
  await page.click('#pbAddSection');
  ok((await page.locator('.shead').count()) === 2, 'a section is added');
  await page.locator('.newplay').first().click();
  await page.waitForSelector('#editBar', { state: 'visible' });
  await drawPin();
  await page.waitForTimeout(450);
  const nm = await page.inputValue('#pbPlayName');
  ok(nm === 'Box Pin 2', 'the play names itself from what was drawn: ' + nm);
  await shot('3-editor');

  // Test it: every defense
  await page.click('#pbTest');
  await page.waitForSelector('#testTable', { timeout: 60000 });
  ok((await page.locator('#testTable tr[data-def]').count()) === 3, 'Test it gives a row for each defense');
  await shot('4-testit');
  await page.click('#testClose');

  // a run against one scheme counts under that scheme
  await page.click('#pbMore summary');
  await page.selectOption('#pbAgainst', 'over');
  await page.click('#pbRunAgainst');
  await page.waitForSelector('#bShare', { timeout: 40000 });
  const ran = await L(() => window.__lastShot.result.scheme);
  ok(ran === 'over', 'Run against Fight over runs against Fight over');
  const counted = await L(() => { const e = window.__lastShot.edit.entry; const k = Object.keys(e.stats)[0]; return e.stats[k].byScheme; });
  ok(counted && counted.over && counted.over.n === 1, 'the run counts under Fight over');
  await page.click('#bBackBook');
  await page.waitForSelector('.prow');
  ok(/Switch \d+%/.test(await page.textContent('.prow small')), 'the playbook shows how the play tested');

  // a typed name never changes; a rule renames the rest
  await page.locator('.newplay').first().click();
  await page.waitForSelector('#editBar', { state: 'visible' });
  await drawPin();
  await page.fill('#pbPlayName', 'Our Special');
  await page.waitForTimeout(400);
  await page.click('#back');
  await page.waitForSelector('.prow');
  await page.click('#back');
  await page.click('#pbTerms');
  await page.click('#termAddAction');
  await page.locator('#termActions .rule input').first().fill('Elevator');
  await page.waitForTimeout(600);
  ok((await page.textContent('#termExample')).includes('Box Elevator'), 'the example shows the new word');
  const names = await L(() => window.__lastShot.books.store.books()[0].plays.map(p => p.name));
  ok(names.includes('Box Elevator') && names.includes('Our Special'), 'the word renames the play named for you, never the one you typed: ' + names.join(', '));
  await shot('5-terms');

  // export, every layout
  await page.click('#back');
  await page.locator('.bitem').first().click();
  await page.click('#pbExport');
  await page.waitForSelector('#xPreview canvas', { timeout: 15000 });
  for (const lay of ['cards', 'storyboard', 'callsheet', 'wristband']) {
    await page.selectOption('[data-opt=layout]', lay);
    await page.waitForTimeout(400);
    ok((await page.locator('#xPreview canvas').count()) >= 1, 'the ' + lay + ' layout previews');
    if (lay === 'storyboard') await shot('6-export-storyboard');
  }
  const dl = page.waitForEvent('download');
  await page.click('#xFile');
  const file = await dl;
  const fp = await file.path();
  ok(/\.last-shot\.json$/.test(file.suggestedFilename()), 'the playbook file downloads: ' + file.suggestedFilename());
  await page.click('#back'); await page.click('#back');
  await page.setInputFiles('#pbImportFile', fp);
  await page.waitForTimeout(500);
  ok((await L(() => window.__lastShot.books.store.books().length)) === 2, 'the file imports back as a second playbook');
  const slots = await L(() => Object.keys(window.__mem).sort());
  ok(slots.includes('last_shot/index') && slots.filter(s => s.startsWith('last_shot/b-')).length === 2, 'the account holds the index and one slot per playbook: ' + slots.join(' '));
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

/* The real assets/cloudsave.js on this page (no stand in): it has no token
   signed out, and finds one through the arcade's RTG_AUTH when signed in. */
async function realCloud() {
  console.log('\nthe real cloud saves module');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|supabase\.co/, r => r.abort());
  await page.goto(BASE + '/last-shot');
  await page.waitForFunction(() => !!window.RTG_SAVE && !!window.RTG_AUTH);
  ok(await page.evaluate(() => window.RTG_SAVE.signedIn() === false), 'signed out, the cloud saves have no token');
  ok(await page.evaluate(() => { window.RTG_AUTH.token = () => 'arcade-token'; return window.RTG_SAVE.signedIn(); }), 'signed in through RTG_AUTH, the cloud saves have the token');
  await ctx.close();
}

try {
  await realCloud();
  await run('phone', { width: 390, height: 844 }, true);
  await run('desktop', { width: 1440, height: 900 }, false);
} finally { await browser.close(); server.close(); }
console.log(fails ? '\n' + fails + ' failed' : '\nall good');
process.exit(fails ? 1 : 0);
