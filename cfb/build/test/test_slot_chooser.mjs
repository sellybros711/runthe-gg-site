/* The two-position chooser, on a phone, with the copy read off the screen.
 *
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_slot_chooser.mjs
 *
 * Deterministic rather than lucky. The page seeds a run with
 * hashSeed(String(Date.now()) + Math.random()), so BOTH are pinned before boot and the
 * first spin is always 2008 Texas A&M with Ryan Tannehill (QB/WR) on the board. Clicking
 * until a two-position man turned up took minutes and usually did not: they are 143 of
 * 14,154 players.
 */
import { chromium } from 'playwright';
const SS = process.env.SS || '/tmp/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(() => { Date.now = () => 1700000000000; Math.random = () => 0.000004; });
await p.goto('http://localhost:8081/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(3000);
await p.evaluate(() => document.getElementById('b-play-intro').click());
/* The reel spins before the tiles appear, so wait for the board rather than a clock. */
await p.waitForSelector('#opts .tile', { timeout: 30000 });
await p.waitForTimeout(400);

const board = (await p.$$eval('#opts .tile', (es) => es.map((e) => e.textContent.replace(/\s+/g, ' ')).join(' | ')));
ok('the pinned spin lands where it should', /Texas A&M/.test(board), board.slice(0, 90));

const clicked = await p.evaluate(() => {
  const t = [...document.querySelectorAll('#opts .tile:not(.off)')]
    .find((e) => /Ryan Tannehill/.test(e.textContent || ''));
  if (!t) return null;
  t.click(); return t.textContent.replace(/\s+/g, ' ').slice(0, 60);
});
ok('the two-position man is on the board and takeable', !!clicked, clicked || 'not found');
await p.waitForTimeout(700);

const kind = await p.evaluate(() => document.getElementById('sheet-in')?.dataset.kind);
ok('tapping him asks where he plays', kind === 'slot', String(kind));

const t = (await p.textContent('#sheet-in')).replace(/\s+/g, ' ').trim();
console.log('  copy: ' + t);
ok('the question names him', /Where does Ryan Tannehill play\?/.test(t));
ok('the explanation is the short one', /Pick a spot\. The one you use decides what is left for the rest of your picks\./.test(t));
ok('every option is labelled by the spot and not by a pronoun',
  /Play at (QB|RB|WR|FLEX)/.test(t) && !/Play him at/.test(t));
ok('each option says what it leaves behind', /Leaves .* to fill|Fills your last spot/.test(t));
ok('the way out says where it goes', /Back to the board/.test(t) && !/Not yet/.test(t));

const geo = await p.evaluate(() => {
  const doc = document.documentElement;
  const over = [...document.querySelectorAll('#sheet-in *')]
    .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1).length;
  const clipped = [...document.querySelectorAll('#sheet-in .slotopt .t span')]
    .filter((e) => e.scrollWidth > e.clientWidth + 1).length;
  return { over, clipped, sw: doc.scrollWidth, cw: doc.clientWidth };
});
ok('nothing in the sheet runs off the side', geo.over === 0, JSON.stringify(geo));
ok('no option line is cut off mid-word', geo.clipped === 0, String(geo.clipped));
ok('nothing logged', errs.length === 0, errs.join(' | ') || 'none');

await p.screenshot({ path: SS + 'slotmodal.png' });
await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
