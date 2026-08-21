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
 *
 * THE BOARD'S SORT CONTROL IS CHECKED HERE FOR THE SAME REASON. All three orders want a
 * board that is known before it is drawn, and this file already has one. It also has the
 * two-position man they disagree about: he sorts under the earlier of his positions rather
 * than wherever the list happened to reach him.
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

/* HOW THE BOARD IS ORDERED IS A CHOICE NOW, and the three orders are checked on whatever
   this pinned seed deals rather than on a board picked to make them true. Only the signable
   rows: blocked ones sink to the bottom whichever order is on, which is the one rule all
   three inherit and the reason it is applied outside the comparator. */
const rows = () => p.$$eval('#opts .tile:not(.off)', (es) => es.map((e) => {
  const m = /\$([\d.]+)(M|K)/.exec(e.textContent || '');
  const f = e.querySelector('.pts b');
  return {
    price: m ? (m[2] === 'K' ? +m[1] / 1000 : +m[1]) : null,
    fppg: f ? parseFloat(f.textContent) : null,
    pos: [...e.querySelectorAll('.pos')].map((x) => x.textContent),
  };
}));
const ORDER = ['QB', 'RB', 'WR', 'TE'];
const desc = (a) => a.every((v, i) => i === 0 || v <= a[i - 1] + 1e-9);
const sortOn = async (k) => { await p.click('#opt-sort button[data-os="' + k + '"]'); await p.waitForTimeout(400); };

/* The order the game opens on. Position is the honest default: points across positions is
   not a ranking, it is a board of quarterbacks. */
ok('it opens in position order', await p.$eval('#opt-sort button[data-os="pos"]',
  (e) => e.classList.contains('on')));
{
  const r = await rows();
  /* A two-position man sorts under the earlier of his positions, which is what idx() picks,
     so the rank read back here has to do the same. */
  const rank = (x) => Math.min(...x.pos.map((q) => (ORDER.indexOf(q) + 1 || 99)));
  const grouped = r.every((x, i) => i === 0 || rank(x) >= rank(r[i - 1]));
  ok('  positions come in order', grouped, r.map((x) => x.pos.join('/')).join(' '));
  /* The thing position order got wrong the first time, pinned: inside a position it ranks by
     points, so the top of a group cannot be decided by the order the rows arrived in. */
  let inner = true;
  for (let i = 1; i < r.length; i++) {
    if (rank(r[i]) === rank(r[i - 1]) && r[i].fppg > r[i - 1].fppg + 1e-9) inner = false;
  }
  ok('  and ranks by points inside each one', inner, r.map((x) => x.fppg).join(', '));
}

await sortOn('salary');
{
  const r = await rows();
  ok('salary orders the board by price, high to low', desc(r.map((x) => x.price)),
    r.map((x) => x.price).join(', '));
}

await sortOn('fppg');
{
  const r = await rows();
  ok('FPPG orders it by points, high to low', desc(r.map((x) => x.fppg)),
    r.map((x) => x.fppg).join(', '));
}

/* THE WHOLE POINT OF THE CONTROL IS NOT SAYING IT AGAIN. Somebody who reads a board by
   points reads every board by points, and six spins a draft is six times to say so. */
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
await p.evaluate(() => document.getElementById('b-play-intro').click());
await p.waitForSelector('#opts .tile', { timeout: 30000 });
await p.waitForTimeout(400);
ok('and the next visit opens in the order you left it in',
  await p.$eval('#opt-sort button[data-os="fppg"]', (e) => e.classList.contains('on')));
ok('  with the board actually in it', desc((await rows()).map((x) => x.fppg)));

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
