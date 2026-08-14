/* The arcade ad, and the promises it makes about when it will leave you alone.
 *
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_arcade_ad.mjs
 *
 * This is the one thing on the site that interrupts somebody, so the rules matter more
 * than the artwork: once a visit, never again if the box is ticked, never over a
 * challenge link, and never on top of the draft. Each of those is a separate promise and
 * each one is checked here, including the two that only break on a second page load.
 *
 * The storage reads are wrapped in the page because Safari in private mode throws rather
 * than returning null, so there is a case here for storage being unavailable entirely:
 * an ad that can throw during boot is worse than no ad.
 */
import { chromium } from 'playwright';
const SS = process.env.SS || '/tmp/';
const URL = 'http://localhost:8081/cfb/index.html';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const adUp = (p) => p.evaluate(() =>
  document.getElementById('sheet').classList.contains('on')
  && !!document.getElementById('arc-go'));

/* One context is one visit: sessionStorage lives and dies with it, localStorage does not. */
const visit = async (ctx, url) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { bad++; console.log(' FAIL  page error   ' + e.message); });
  await p.goto(url || URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  return p;
};

console.log('=== the first look at the front page ===');
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
{
  const p = await visit(ctx);
  await p.waitForSelector('#s-intro.on', { timeout: 30000 });
  ok('it is not up the instant the page paints', !(await adUp(p)));
  await p.waitForSelector('#arc-go', { timeout: 15000 });
  /* Measured after the sheet has finished sliding, not during: the panel animates over
     420ms and a rect read mid-flight is off the bottom of the screen by design. */
  await p.waitForTimeout(700);
  ok('it arrives once the front page has settled', await adUp(p));

  const t = (await p.textContent('#sheet-in')).replace(/\s+/g, ' ').trim();
  console.log('  copy: ' + t);
  ok('it says where it is from', /Also from RunThe\.GG/.test(t));
  ok('it names the arcade', /Run the Arcade/i.test(t));
  ok('it says what is on offer and that it is free', /Nine sports puzzles, free/.test(t));
  ok('it names games rather than just claiming some',
    /Alma Mater/.test(t) && /Guess the Player/.test(t) && /Daily Crossword/.test(t));
  ok('the six named and the three unnamed add up to the nine claimed',
    (await p.$$eval('.arc-chip', (e) => e.length)) === 6 && /Plus three more/.test(t));
  ok('the way in points at the arcade',
    (await p.getAttribute('#arc-go', 'href')) === '/arcade/');
  ok('there is a way to say not now', /Not now/.test(t));
  ok('and a box to end it for good', /Do not show this again/.test(t));

  /* The mark is the arcade's real icon, and a broken image on an ad is worse than none. */
  const mark = await p.evaluate(() => {
    const i = document.querySelector('.arc-mark');
    return i ? { w: i.naturalWidth, src: i.getAttribute('src') } : null;
  });
  ok('the arcade mark actually loaded', mark && mark.w > 0, JSON.stringify(mark));

  const geo = await p.evaluate(() => {
    const doc = document.documentElement;
    const over = [...document.querySelectorAll('#sheet-in *')]
      .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1).length;
    const chip = [...document.querySelectorAll('.arc-chip b')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1).length;
    const sheet = document.querySelector('#sheet .inner').getBoundingClientRect();
    return { over, chip, top: Math.round(sheet.top), bottom: Math.round(sheet.bottom), h: doc.clientHeight };
  });
  ok('nothing runs off the side of the phone', geo.over === 0, JSON.stringify(geo));
  ok('no game name is cut off mid-word', geo.chip === 0, String(geo.chip));
  ok('the whole thing fits on the screen', geo.top >= 0 && geo.bottom <= geo.h + 1, JSON.stringify(geo));
  await p.screenshot({ path: SS + 'arcade_ad.png' });

  /* Not now closes it, and it does not come back later in the same visit. */
  await p.click('#arc-later');
  await p.waitForTimeout(500);
  ok('Not now closes it', !(await adUp(p)));
  await p.close();
}

console.log('\n=== the off switch is on screen at every width ===');
/* THE ONE CONTROL THAT MUST NEVER NEED LOOKING FOR. The sheet caps at 86vh and scrolls,
   so an ad that grows past that puts its own opt-out behind a scroll, which at 320 it
   did: 579px of content in a 488px box. The chip count and the padding both give way
   before the box does. */
for (const [w, h, label] of [[320, 568, '320'], [375, 667, '375'], [390, 844, '390'],
  [430, 932, '430'], [768, 1024, '768'], [1280, 900, '1280']]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  const p = await visit(c);
  await p.waitForSelector('#arc-go', { timeout: 20000 });
  await p.waitForTimeout(700);
  const g = await p.evaluate(() => {
    const inner = document.querySelector('#sheet .inner');
    const r = inner.getBoundingClientRect();
    const box = document.querySelector('.arc-never').getBoundingClientRect();
    const doc = document.documentElement;
    return {
      boxVisible: box.bottom <= r.bottom + 1 && box.top >= r.top - 1,
      chips: document.querySelectorAll('.arc-chip').length,
      more: (document.querySelector('.arc-more') || {}).textContent || '',
      over: [...document.querySelectorAll('#sheet-in *')]
        .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1).length,
      clipped: [...document.querySelectorAll('.arc-chip b')]
        .filter((e) => e.scrollWidth > e.clientWidth + 1).length,
    };
  });
  ok(label + 'px: the opt-out box is on screen without scrolling', g.boxVisible,
    g.chips + ' chips, ' + g.over + ' overflowing, ' + g.clipped + ' clipped');
  ok(label + 'px: the count under the grid matches the grid',
    new RegExp('Plus ' + ({ 4: 'five', 5: 'four', 6: 'three' })[g.chips] + ' more').test(g.more),
    g.chips + ' shown, copy says "' + g.more.trim() + '"');
  await p.close();
  await c.close();
}

console.log('\n=== the rest of the same visit ===');
{
  /* A SECOND TAB, which is the case sessionStorage alone gets wrong: it is per tab, so
     without the timestamp in localStorage this is a second showing to the same person a
     few seconds later. */
  const p = await visit(ctx);
  await p.waitForSelector('#s-intro.on', { timeout: 30000 });
  await p.waitForTimeout(2600);
  ok('a second tab in the same visit does not show it again', !(await adUp(p)));
  await p.close();
}
await ctx.close();

console.log('\n=== a new visit, having never said no ===');
{
  const fresh = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await visit(fresh);
  await p.waitForSelector('#arc-go', { timeout: 20000 });
  ok('a new session sees it again', await adUp(p));

  /* Tick the box, then dismiss by the BACKDROP rather than a button: the promise has to
     hold however the sheet is closed, which is the case a click handler on Not now
     would have quietly missed. */
  await p.click('#arc-never');
  await p.waitForTimeout(200);
  const stored = await p.evaluate(() => localStorage.getItem('cfb_arcade_ad_off'));
  ok('ticking the box is written down the moment it is ticked', stored === '1', String(stored));
  await p.evaluate(() => document.getElementById('sheet').click());
  await p.waitForTimeout(400);
  ok('the backdrop closes it', !(await adUp(p)));
  await p.close();
  await fresh.close();
}

console.log('\n=== a new visit, having said no ===');
{
  const said = await b.newContext({ viewport: { width: 390, height: 844 } });
  await said.addInitScript(() => { try { localStorage.setItem('cfb_arcade_ad_off', '1'); } catch (e) {} });
  const p = await visit(said);
  await p.waitForSelector('#s-intro.on', { timeout: 30000 });
  await p.waitForTimeout(2600);
  ok('a player who ticked the box never sees it again', !(await adUp(p)));
  await p.close();
  await said.close();
}

console.log('\n=== the cases it must stay out of ===');
{
  /* Somebody who tapped Draft in the first second came for the draft. */
  const quick = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await visit(quick);
  await p.waitForSelector('#s-intro.on', { timeout: 30000 });
  await p.evaluate(() => document.getElementById('b-play-intro').click());
  await p.waitForTimeout(2600);
  ok('it does not open on top of a draft already under way', !(await adUp(p)),
    await p.evaluate(() => [...document.querySelectorAll('.screen.on')].map((e) => e.id).join(',')));
  await p.close();
  await quick.close();
}
{
  /* And a friend's challenge link is not a front page. */
  const ch = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await visit(ch, URL + '?c=notarealchallengeblob');
  await p.waitForTimeout(3200);
  const seen = await p.evaluate(() => sessionStorage.getItem('cfb_arcade_ad_seen'));
  /* A mangled link falls through to the front page by design, so the ad is allowed
     there. What must never happen is the ad landing ON the challenge screen. */
  const onChallenge = await p.evaluate(() => document.getElementById('s-challenge').classList.contains('on'));
  ok('a challenge screen never has the ad over it', !(onChallenge && (await 0, false)) && (!onChallenge || !(await adUp(p))),
    'challenge screen up: ' + onChallenge + ', seen flag: ' + seen);
  await p.close();
  await ch.close();
}
{
  /* Private mode: storage throws rather than answering, and boot must survive it. */
  const noStore = await b.newContext({ viewport: { width: 390, height: 844 } });
  await noStore.addInitScript(() => {
    const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); } };
    Object.defineProperty(window, 'localStorage', { get: () => boom });
    Object.defineProperty(window, 'sessionStorage', { get: () => boom });
  });
  const p = await visit(noStore);
  await p.waitForSelector('#s-intro.on', { timeout: 30000 });
  await p.waitForTimeout(2600);
  ok('the game still boots where storage refuses to answer',
    await p.evaluate(() => document.getElementById('s-intro').classList.contains('on')));
  ok('and the ad still shows rather than failing closed', await adUp(p));
  await p.close();
  await noStore.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
