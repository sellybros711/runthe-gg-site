#!/usr/bin/env node
/* Stumpire in a real browser, at a phone's size and a desktop's, against the
 * real API over the in-memory database (build/dev-server.mjs).
 *
 *   node functions/_stumpire/test/check-browser.mjs [--shots DIR]
 *
 * Every line prints " ok " or " FAIL ". It plays a game to the end: the
 * gate, the pitch, the typeahead, a strike, the picker, a hit, an out, the
 * reveal, the share line, and the admin page's gate and preview. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { makeServer } from '../build/dev-server.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;

let fails = 0;
const claim = (ok, what) => { console.log((ok ? ' ok ' : ' FAIL ') + what); if (!ok) fails++; };

const srv = await makeServer();
const base = 'http://localhost:' + srv.port;
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
try {
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));

    const nobody = await page.goto(base + '/arcade/stumpire/?as=nobody');
    claim(nobody.status() === 404, w + ': a non-tester gets a 404 for the page');
    const adminAsTester = await page.goto(base + '/arcade/stumpire/admin?as=tester');
    claim(adminAsTester.status() === 404, w + ': a tester gets a 404 for the admin page');

    await page.goto(base + '/arcade/stumpire/?as=tester');
    await page.waitForSelector('#nextBtn:not(.hide)', { state: 'attached' });
    await page.waitForFunction(() => !document.getElementById('next').classList.contains('hide'));
    claim(/#\d+/.test(await page.textContent('#slNo')), w + ': the slate number shows');
    claim(await page.isHidden('#atbat'), w + ': the prompt is hidden until the pitch');
    await page.click('#nextBtn');
    await page.waitForFunction(() => !document.getElementById('atbat').classList.contains('hide'));
    const prompt = await page.textContent('#prompt');
    claim(prompt.length > 5, w + ': the prompt shows after the pitch (' + prompt + ')');
    claim(/called 3 answers\. One of them: .+\./.test(await page.textContent('#tell')), w + ': the called count and the tell show');
    const c0 = Number(await page.textContent('#clock'));
    await page.waitForTimeout(1300);
    claim(Number(await page.textContent('#clock')) < c0, w + ': the clock counts down');

    // A strike: Tom Brady is not a Gold Glove winner.
    await page.fill('#answer', 'Tom Brady'); await page.press('#answer', 'Enter');
    await page.waitForSelector('#ruling .STRIKE');
    claim(true, w + ': a wrong answer is a STRIKE');
    claim((await page.$$('#strikes span.on')).length === 1, w + ': and the strike is on the board');

    // NO PITCH
    await page.fill('#answer', 'qqzzxx vvbbnn'); await page.press('#answer', 'Enter');
    await page.waitForSelector('#ruling .NO_PITCH');
    claim((await page.$$('#strikes span.on')).length === 1, w + ': NO PITCH costs nothing');

    // The picker, and the clock standing still behind it.
    await page.fill('#answer', 'Ken Griffey'); await page.press('#answer', 'Enter');
    await page.waitForSelector('#picker[style*="flex"]');
    const t1 = await page.textContent('#clock');
    await page.waitForTimeout(1500);
    claim(await page.textContent('#clock') === t1, w + ': the clock stops while the picker is open');
    const pickBox = await page.locator('#pickOpts button').first().boundingBox();
    claim(pickBox && pickBox.y + pickBox.height <= h, w + ': the picker options are on screen');
    await page.click('#pickOpts button >> text=Ken Griffey Jr.');
    await page.waitForFunction(() => document.getElementById('picker').style.display === 'none');
    await page.waitForSelector('#ruling:not(.hide) .ruling');
    const r1 = await page.textContent('#ruling');
    claim(/SAFE|OUT|STRIKE/.test(r1), w + ': a pick from the picker is ruled (' + r1.split('.')[0] + ')');

    // Play the rest through the typeahead, tapping the first suggestion.
    for (let guard = 0; guard < 160; guard++) {
      if (await page.isVisible('#over:not(.hide)')) break;
      if (await page.isVisible('#next:not(.hide)')) { await page.click('#nextBtn'); await page.waitForFunction(() => !document.getElementById('atbat').classList.contains('hide')); continue; }
      if (!(await page.isVisible('#answer'))) { await page.waitForTimeout(300); continue; }
      await page.fill('#answer', ['derek je', 'jerome bet', 'magic joh', 'steve na', 'tony gonz'][guard % 5]);
      await page.waitForSelector('#sugg button', { timeout: 3000 }).catch(() => null);
      const names = await page.$$eval('#sugg button span:first-child', b => b.map(x => x.textContent));
      if (names.length) claim(names.join() === [...names].sort().join(), w + ': typeahead is alphabetical');
      if (names.length && await page.isVisible('#sugg button')) await page.click('#sugg button', { timeout: 3000 }).catch(() => null); else if (await page.isVisible('#answer')) await page.press('#answer', 'Enter');
      await page.waitForTimeout(200);
    }
    await page.waitForSelector('#over:not(.hide) pre.share', { timeout: 5000 }).catch(() => null);
    const share = await page.textContent('#shareText').catch(() => '');
    claim(/^Stumpire #\d+\n.+\n\d+\/20 · \d outs? · \d+ strikes?$/.test(share.trim()), w + ': the game ends on a share line');
    claim((await page.$$('#history li')).length >= 3, w + ': the box score lists the at-bats with their called lists');
    claim(await page.$eval('#ump', e => !!e.dataset.mood && !!e.dataset.state), w + ': the Stumpire hook carries a mood and a state');
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    claim(scrollW <= w, w + ': no sideways scroll');
    if (SHOTS) await page.screenshot({ path: SHOTS + '/stumpire-' + w + '.png', fullPage: true });
    claim(!errors.length, w + ': no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));

    // Admin
    const adm = await page.goto(base + '/arcade/stumpire/admin?as=admin');
    claim(adm.status() === 200, w + ': the admin page opens for an admin');
    await page.waitForFunction(() => document.querySelectorAll('#testers tr').length > 1);
    await page.click('#preview');
    await page.waitForSelector('#pv p');
    claim(/valid answers/.test(await page.textContent('#pv')), w + ': the authoring preview shows counts and bands');
    if (SHOTS) await page.screenshot({ path: SHOTS + '/stumpire-admin-' + w + '.png', fullPage: true });
    await ctx.close();
    // A fresh slate per viewport: wipe the plays so the next pass plays from the top.
    srv.db._state.plays.length = 0;
  }
} finally {
  await browser.close();
  srv.server.close();
}
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
