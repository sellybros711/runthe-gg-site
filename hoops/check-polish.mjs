/* The UI pass that brought the front page and the economy screens up to Run
 * The Tour's: one material, one notice lane, the shop one tap from anywhere.
 *
 *   node hoops/check-polish.mjs
 *   SHOT=/tmp/u.png node hoops/check-polish.mjs   and screenshots
 *
 * What it holds, each a property of the page rather than a pixel:
 *   1. pops share one lane: two at once never overlap, and while a full
 *      screen sheet is open the lane moves to the foot so it covers neither
 *      the sheet's title nor its close key
 *   2. the coin pill in the top bar is the wallet's balance, follows it, and
 *      opens the Locker on the Shop; it is not drawn on the draft
 *   3. the Locker opens with no career at all, has the shop and both looks,
 *      and closes on its key
 *   4. every sheet's close key is the kit's pixel X, never a bare letter
 *   5. the front page is one material: its cards are square on a frame
 *   6. a Hall card saved without a verdict never prints "undefined"
 *   7. the pack art leads: the Locker's banner fans one pack per pack on the
 *      shelf and says every piece comes from one, the front page's Locker key
 *      is a pack, and the closet's stage glows in a tried on piece's rarity
 *   8. the front page player is traced fine once the page is idle: at least
 *      two fine pixels a cell, landing on whole device pixels, never the one
 *      a cell mosaic a scale of 5 used to fall back to
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL ' + msg); } };

const pw = (() => { try { return require('playwright'); } catch (e) { return createRequire('/opt/node22/lib/node_modules/')('playwright'); } })();
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const out = [];
async function serve(route){
  const u = new URL(route.request().url());
  if (/stripe|checkout/.test(u.pathname)) { out.push(u.pathname); return route.fulfill({ status: 500, body: '{"error":"blocked"}' }); }
  if (u.hostname !== 'local.test') return route.abort();
  if (u.pathname.startsWith('/sb/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return route.abort();
  await route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
}
const shot = async (page, tag) => { if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-' + tag + '.png') }); };
const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);

const b = await pw.chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage(), boom = [];
page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
await page.addInitScript(() => {
  try {
    localStorage.setItem('rtf.guide.v1', '1'); localStorage.setItem('rtf.scenes.v1', 'off');
    /* a Hall card from before verdicts were kept */
    localStorage.setItem('rtf.life.v1', JSON.stringify({ cur: null, hof: [{ name: 'Dre Okafor', num: 7, pos: 'SG', score: 88, look: { skin: 4, hair: 'twists' }, c1: '#1d428a', c2: '#ffc72c' }] }));
  } catch (e) {}
  window.RTF_BOARD_URL = 'http://local.test/sb';
});
await page.route('**/*', serve);
await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#b-career:not([disabled])', { state: 'attached', timeout: 30000 });
await page.evaluate(() => { const st = RTF_AUTH.state; RTF_AUTH.state = () => Object.assign({}, st(), { signedIn: true }); RTF_EARN.settle({}); RTF_DAILY_UI.render(); RTF_PAGE.coins(); });
await page.waitForTimeout(600);

/* 6 */
{
  const t = await page.evaluate(() => ({ home: document.getElementById('s-home').innerText, best: (document.getElementById('ch-best') || {}).textContent || '' }));
  ok(!/undefined|NaN/.test(t.home), '6 the front page prints no undefined or NaN (' + (t.home.match(/.{0,30}undefined.{0,10}/) || [''])[0] + ')');
  ok(/Dre Okafor/.test(t.best) && /88|Hall|ballot|Legend|Star|All|Journeyman|Starter/i.test(t.best) && !/undefined/.test(t.best), '6 an old Hall card reads its verdict off its score (' + t.best + ')');
}

/* 8 */
{
  await page.waitForFunction(() => { const c = document.querySelector('#ch-cast .ch-p.c canvas.rtf-baller'); return c && c.width > 44; }, null, { timeout: 8000 }).catch(() => {});
  const f = await page.evaluate(() => { const c = document.querySelector('#ch-cast .ch-p.c .rtf-baller'); if (!c) return null; const r = c.width / 44, dev = c.getBoundingClientRect().height * devicePixelRatio / 64; return { r, step: dev / r }; });
  ok(f && f.r >= 2, '8 the front page player is traced at least two fine pixels a cell (' + (f && f.r) + ')');
  ok(f && Math.abs(f.step - Math.round(f.step)) < 0.02, '8 and each fine pixel lands on whole device pixels (' + (f && f.step) + ')');
}

/* 2 */
{
  const c = await page.evaluate(() => {
    const p = document.getElementById('ab-coins');
    return { shown: !!p && !p.hidden && p.getBoundingClientRect().width > 0, text: (document.getElementById('ab-cn') || {}).textContent, bal: RTF_WARD.wallet.balance() };
  });
  ok(c.shown, '2 the top bar carries the coin pill on the front page');
  ok(c.text === c.bal.toLocaleString('en-US'), '2 and it is the wallet balance (' + c.text + ' against ' + c.bal + ')');
  await page.evaluate(() => RTF_WARD.wallet.award('polish:test', 1234, 'test'));
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ text: document.getElementById('ab-cn').textContent, bal: RTF_WARD.wallet.balance() }));
  ok(after.text === after.bal.toLocaleString('en-US') && after.bal === c.bal + 1234, '2 it follows the wallet the moment coins land (' + after.text + ')');
  const bar = await page.evaluate(() => { const a = document.querySelector('.appbar').getBoundingClientRect(), wm = document.querySelector('.appbar .wm'); return { over: [...document.querySelectorAll('.appbar *')].some((e) => e.getBoundingClientRect().right > innerWidth + 1), clip: wm.scrollWidth > wm.clientWidth + 1, h: a.height }; });
  ok(!bar.over && !bar.clip, '2 at 390px the bar holds the wordmark, the pill and Career without cutting any of them');
}

/* 1 */
{
  await page.evaluate(() => { RTF_WARD.pass.xp('polish:a', 400); RTF_EARN.pay('polish:pop', 50, 'run'); });
  await page.waitForTimeout(450);
  const pops = await page.evaluate(() => [...document.querySelectorAll('.k-lane > .on')].map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  ok(pops.length >= 2, '1 two pops are up at once (' + pops.map((p) => p.cls).join(', ') + ')');
  let clash = false; for (let i = 0; i < pops.length; i++) for (let j = i + 1; j < pops.length; j++) if (overlap(pops[i], pops[j])) clash = true;
  ok(!clash, '1 and neither covers the other');
  const bar = await page.evaluate(() => document.querySelector('.appbar').getBoundingClientRect().bottom);
  ok(pops.every((p) => p.top >= bar - 1), '1 they sit under the top bar, not on it');
  await shot(page, 'home');
}

/* 3, and the lane at the foot */
{
  ok(await page.evaluate(() => RTF_CAREER_UI.openLocker('shop')), '3 the Locker opens with no career in progress');
  await page.waitForSelector('#rtf-locker:not([hidden]) #lk-pane .sh-shop, #rtf-locker:not([hidden]) #lk-pane *', { timeout: 5000 });
  const lk = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('#rtf-locker [data-ktab]')].map((x) => x.getAttribute('data-ktab')), body: !!document.querySelector('#rtf-locker [data-ktab="body"]'), pane: document.getElementById('lk-pane').children.length }));
  ok(lk.tabs.join() === 'shop,street,court' && !lk.body && lk.pane > 0, '3 it holds the shop and both looks, and no Body tab (' + lk.tabs.join() + ')');
  const ban = await page.evaluate(() => ({ fan: document.querySelectorAll('#rtf-locker .lk-fan .lk-fp img').length, shelf: RTF_PACKS.IDS.filter((x) => RTF_PACKS.available(x)).length, sub: (document.querySelector('#rtf-locker .lk-sub') || {}).textContent || '', icons: document.querySelectorAll('#rtf-locker .lk-tabs .lk-ti').length }));
  ok(ban.fan === ban.shelf && ban.fan > 0, '7 the banner fans one pack per pack on the shelf (' + ban.fan + ' of ' + ban.shelf + ')');
  ok(/every piece comes from a pack/i.test(ban.sub) && ban.icons === 3, '7 it says every piece comes from a pack, and every tab wears its icon');
  /* the closet's stage takes the rarity of what he tries on */
  await page.click('#rtf-locker [data-ktab="street"]');
  await page.waitForSelector('#lk-pane .cl-tile.lock');
  const st0 = await page.evaluate(() => document.querySelector('#lk-pane .cl-fig').style.getPropertyValue('--sc'));
  const tr = await page.evaluate(() => { const t = [...document.querySelectorAll('#lk-pane .cl-tile.lock')].find((x) => !x.classList.contains('r-common')) || document.querySelector('#lk-pane .cl-tile.lock'); t.click(); return RTF_CATALOG.item(t.dataset.id).rarity; });
  const st1 = await page.evaluate(() => { const f = document.querySelector('#lk-pane .cl-fig'); return { sc: f.style.getPropertyValue('--sc'), on: f.classList.contains('is-try'), tag: (f.querySelector('.cl-stag') || {}).textContent || '' }; });
  ok(st1.on && st1.sc !== st0 && st1.tag.toLowerCase() === tr, '7 the stage takes the tried on piece\'s rarity (' + st0 + ' to ' + st1.sc + ', ' + st1.tag + ')');
  await page.click('#rtf-locker [data-ktab="shop"]');
  await page.evaluate(() => { RTF_EARN.pay('polish:pop2', 50, 'run'); });
  await page.waitForTimeout(450);
  const foot = await page.evaluate(() => { const l = document.querySelector('.k-lane'), on = l && l.querySelector('.on'); return { foot: !!l && l.classList.contains('foot'), top: on ? on.getBoundingClientRect().top : -1, h: innerHeight }; });
  ok(foot.foot && foot.top > foot.h / 2, '1 with a sheet open the lane is at the foot of the screen (' + foot.top + ' of ' + foot.h + ')');
  await shot(page, 'locker');
  await page.click('#rtf-locker .lk-x');
  ok(await page.evaluate(() => document.getElementById('rtf-locker').hidden), '3 it closes on its key');
  await page.waitForTimeout(100);
  ok(await page.evaluate(() => { const l = document.querySelector('.k-lane'); return !!l && !l.classList.contains('foot'); }), '1 and the lane goes back under the top bar');
  await page.click('#ab-coins');
  ok(await page.evaluate(() => !document.getElementById('rtf-locker').hidden && document.querySelector('#rtf-locker [data-ktab="shop"]').getAttribute('aria-selected') === 'true'), '2 the coin pill opens the Locker on the Shop');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => !!document.querySelector('#hp-daily [data-locker]')), '3 the front page row has a door to the Locker');
  ok(await page.evaluate(() => !!document.querySelector('#hp-daily [data-locker] img.dy-lkpack')), '7 and that door is a pack');
}

/* 4 */
{
  await page.evaluate(() => RTF_DAILY_UI.open('wheel'));
  await page.waitForSelector('.dy-ov .dy-x');
  const dy = await page.evaluate(() => { const x = document.querySelector('.dy-ov .dy-x'); return { kit: x.classList.contains('k-x') && !!x.querySelector('img'), text: x.textContent.trim() }; });
  ok(dy.kit && dy.text === '', '4 the daily hub closes on the kit X, not a letter (' + JSON.stringify(dy) + ')');
  await page.click('.dy-ov .dy-x');
  await page.evaluate(() => RTF_PASS_UI.open && RTF_PASS_UI.open());
  await page.waitForSelector('.fp-ov .fp-x');
  const fp = await page.evaluate(() => { const x = document.querySelector('.fp-ov .fp-x'); return { kit: x.classList.contains('k-x') && !!x.querySelector('img'), text: x.textContent.trim(), round: getComputedStyle(x).borderTopLeftRadius }; });
  ok(fp.kit && fp.text === '' && fp.round === '0px', '4 so does the Floor Pass, and the key is square (' + JSON.stringify(fp) + ')');
  await page.click('.fp-ov .fp-x');
}

/* 5 */
{
  const r = await page.evaluate(() => ['.classic', '.dailycard', '.pz', '.hp-modes', '.hdoor', '#b-start'].map((sel) => {
    const el = document.querySelector('#s-home ' + sel); if (!el) return [sel, 'missing'];
    const cs = getComputedStyle(el); return [sel, cs.borderTopLeftRadius, /3px/.test(cs.boxShadow) || /rgb/.test(cs.boxShadow) ? 'frame' : 'none'];
  }));
  ok(r.every((x) => x[1] === '0px' && x[2] === 'frame'), '5 every front page card is square on a frame (' + r.filter((x) => x[1] !== '0px' || x[2] !== 'frame').map((x) => x.join(' ')).join('; ') + ')');
  const tight = await page.evaluate(() => { const a = document.querySelector('#s-home .dailycard').getBoundingClientRect(), m = document.querySelector('#s-home .hp-modes').getBoundingClientRect(); return m.top - a.bottom; });
  ok(tight >= 14, '5 stacked framed cards keep their frames apart (' + Math.round(tight) + 'px)');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(wide <= 0, '5 and nothing hangs off a 390px phone (' + wide + ')');
}

ok(!out.length, 'no request reached a payment endpoint');
ok(!boom.length, 'nothing threw (' + boom.join(' | ') + ')');
await b.close();
console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
