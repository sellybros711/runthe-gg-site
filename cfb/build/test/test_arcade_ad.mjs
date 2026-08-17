/* The arcade house ad, and the promises it makes about when it will leave you alone.
 *
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_arcade_ad.mjs
 *
 * DRIVEN THROUGH THE HOMEPAGE, not through the college game. The panel lives in
 * /assets/arcade-ad.js and is shared by the homepage, the NFL game and the golf game,
 * with one set of storage keys between them; the college game used to run it too and no
 * longer does, by request. This file follows the panel rather than the surface, so it
 * moved with it. The last section holds the removal: the college game must keep asking
 * nobody, which is a thing a later change could undo by accident.
 *
 * This is the one thing on the site that interrupts somebody, so the rules matter more
 * than the artwork: once a visit, never again if the box is ticked, and never stacked on
 * a sheet somebody already opened.
 *
 * The storage reads are wrapped in the shared file because Safari in private mode throws
 * rather than returning null, so there is a case here for storage being unavailable
 * entirely: an ad that can throw during boot is worse than no ad.
 */
import { chromium } from 'playwright';
const SS = process.env.SS || '/tmp/';
const URL = 'http://localhost:8081/index.html';
const CFB = 'http://localhost:8081/cfb/index.html';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const AD = '.rtgaa';
const adUp = (p) => p.evaluate(() => !!document.querySelector('.rtgaa'));

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
  ok('it is not up the instant the page paints', !(await adUp(p)));
  await p.waitForSelector(AD, { timeout: 15000 });
  await p.waitForTimeout(500);
  ok('it arrives once the front page has settled', await adUp(p));

  const t = (await p.textContent(AD)).replace(/\s+/g, ' ').trim();
  console.log('  copy: ' + t);
  ok('it says where it is from', /Also from RunThe\.GG/.test(t));
  ok('it names the arcade', /Run The Arcade/i.test(t));
  ok('it says what is on offer and that it is free',
    /Ten quick sports brain-games/.test(t) && /Free/.test(t));
  ok('it names games rather than just claiming some',
    /Alma Mater/.test(t) && /Guess the Player/.test(t) && /Crossword/.test(t));
  /* All ten are named now rather than six-plus-a-count, so the grid and the claim above it
     cannot drift apart the way they could when one was a number and the other a list.
     The tile is read as an element rather than out of the flattened text: the count and
     its label are adjacent nodes, so textContent gives "10GAMES" and a \b10\b never
     matches -- which is a bug in the test, not in the panel. */
  const claimed = await p.evaluate(() => {
    const s = document.querySelector('.rtgaa-stat b');
    return s ? s.textContent.trim() : null;
  });
  ok('all ten are named, and the count agrees',
    (await p.$$eval('.rtgaa-chip', (e) => e.length)) === 10 && claimed === '10',
    'grid vs tile: ' + claimed);
  ok('the way in points at the arcade',
    (await p.getAttribute('.rtgaa-go', 'href')) === '/arcade/');
  /* A NEW TAB, because this page may have a season in progress on it. */
  ok('and it opens in a new tab, leaving the season alone',
    (await p.getAttribute('.rtgaa-go', 'target')) === '_blank'
    && /noopener/.test((await p.getAttribute('.rtgaa-go', 'rel')) || ''));
  ok('there is a way to say not now', /Maybe later/.test(t));
  ok('and a box to end it for good', /Don.t show this again/.test(t));

  const geo = await p.evaluate(() => {
    const doc = document.documentElement;
    const over = [...document.querySelectorAll('.rtgaa *')]
      .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1).length;
    const chip = [...document.querySelectorAll('.rtgaa-chip')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1).length;
    /* The close button used to be absolutely positioned and landed on the kicker pill. */
    const x = document.querySelector('.rtgaa-x').getBoundingClientRect();
    const k = document.querySelector('.rtgaa-kick').getBoundingClientRect();
    return { over, chip, clearOfKick: x.bottom <= k.top + 1 || x.right <= k.left + 1 };
  });
  ok('nothing runs off the side of the phone', geo.over === 0, JSON.stringify(geo));
  ok('no game name is cut off mid-word', geo.chip === 0, String(geo.chip));
  ok('the close button clears the kicker', geo.clearOfKick, JSON.stringify(geo));
  await p.screenshot({ path: SS + 'arcade_ad.png' });

  /* Maybe later closes it, and it does not come back later in the same visit. */
  await p.click('.rtgaa-later');
  await p.waitForTimeout(400);
  ok('Maybe later closes it', !(await adUp(p)));
  await p.close();
}

console.log('\n=== the off switch is on screen at every width ===');
/* THE ONE CONTROL THAT MUST NEVER NEED LOOKING FOR. The panel is a full-screen overlay
   that scrolls, so on a short phone the box can end up below the fold unless the layout
   gives way first -- which is what the max-height rule in the shared file is for. */
for (const [w, h, label] of [[320, 568, '320'], [375, 667, '375'], [390, 844, '390'],
  [430, 932, '430'], [768, 1024, '768'], [1280, 900, '1280']]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  const p = await visit(c);
  await p.waitForSelector(AD, { timeout: 20000 });
  await p.waitForTimeout(500);
  const g = await p.evaluate(() => {
    const box = document.querySelector('.rtgaa-chk').getBoundingClientRect();
    const doc = document.documentElement;
    return {
      boxVisible: box.bottom <= window.innerHeight + 1 && box.top >= -1,
      chips: document.querySelectorAll('.rtgaa-chip').length,
      over: [...document.querySelectorAll('.rtgaa *')]
        .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1).length,
      clipped: [...document.querySelectorAll('.rtgaa-chip')]
        .filter((e) => e.scrollWidth > e.clientWidth + 1).length,
    };
  });
  ok(label + 'px: the opt-out box is on screen without scrolling', g.boxVisible,
    g.chips + ' chips, ' + g.over + ' overflowing, ' + g.clipped + ' clipped');
  ok(label + 'px: nothing overflows or clips', g.over === 0 && g.clipped === 0,
    JSON.stringify(g));
  await p.close();
  await c.close();
}

console.log('\n=== the rest of the same visit ===');
{
  /* A SECOND TAB, which is the case sessionStorage alone gets wrong: it is per tab, so
     without the timestamp in localStorage this is a second showing to the same person a
     few seconds later. */
  const p = await visit(ctx);
  await p.waitForTimeout(2600);
  ok('a second tab in the same visit does not show it again', !(await adUp(p)));
  await p.close();
}
await ctx.close();

console.log('\n=== a new visit, having never said no ===');
{
  const fresh = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await visit(fresh);
  await p.waitForSelector(AD, { timeout: 20000 });
  ok('a new session sees it again', await adUp(p));

  /* Tick the box, then dismiss by the BACKDROP rather than a button: the promise has to
     hold however the panel is closed, which is the case a click handler on Maybe later
     would have quietly missed. */
  await p.click('.rtgaa-chk input');
  await p.waitForTimeout(200);
  const stored = await p.evaluate(() => localStorage.getItem('rtg_arcade_ad_off'));
  ok('ticking the box is written down the moment it is ticked', stored === '1', String(stored));
  /* The backdrop is the overlay itself; a tap on the panel inside it is not a dismissal. */
  await p.evaluate(() => {
    const n = document.querySelector('.rtgaa');
    n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await p.waitForTimeout(300);
  ok('the backdrop closes it', !(await adUp(p)));
  await p.close();
  await fresh.close();
}

console.log('\n=== a new visit, having said no ===');
{
  const said = await b.newContext({ viewport: { width: 390, height: 844 } });
  await said.addInitScript(() => { try { localStorage.setItem('rtg_arcade_ad_off', '1'); } catch (e) {} });
  const p = await visit(said);
  await p.waitForTimeout(2600);
  ok('a player who ticked the box never sees it again', !(await adUp(p)));
  await p.close();
  await said.close();
}

console.log('\n=== the cases it must stay out of ===');
{
  /* A sheet somebody already opened is a thing they asked for. The homepage opens its
     sign-in sheet by itself on the way back from Google, so this is a real collision and
     not a hypothetical one. */
  const busy = await b.newContext({ viewport: { width: 390, height: 844 } });
  await busy.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const m = document.getElementById('modal');
      if (m) m.hidden = false;
    });
  });
  const p = await visit(busy);
  await p.waitForTimeout(3000);
  const modalUp = await p.evaluate(() => {
    const m = document.getElementById('modal'); return !!(m && !m.hidden);
  });
  ok('it does not stack on a sheet that is already open', !modalUp || !(await adUp(p)),
    'sign-in sheet up: ' + modalUp);
  await p.close();
  await busy.close();
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
  await p.waitForTimeout(3000);
  /* "The page came up" measured by its own content, not by readyState: the homepage has
     video and canvas still settling at this point and a strict complete is a flaky
     assertion about loading rather than about surviving. */
  ok('the page still comes up where storage refuses to answer',
    await p.evaluate(() => !!document.getElementById('acct')
      && document.querySelectorAll('a[href]').length > 5));
  ok('and the ad still shows rather than failing closed', await adUp(p));
  await p.close();
  await noStore.close();
}

console.log('\n=== and the college game asks nobody ===');
/* REMOVED BY REQUEST, and this is what keeps it removed. The shared panel is one script
   tag and one call away from being back on any surface, so "we took it off the college
   game" needs something holding it there rather than a memory of having deleted it. */
{
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await visit(c, CFB);
  await p.waitForSelector('#s-intro.on', { timeout: 30000 });
  await p.waitForTimeout(3200);
  ok('the front page of the college game never puts it up', !(await adUp(p)));
  ok('and it does not even load the shared panel', await p.evaluate(() =>
    !window.RTG_ARCADE_AD && ![...document.scripts].some((x) => /arcade-ad/.test(x.src || ''))));
  /* Sitting on the front page for a while is the case that used to trigger it. */
  await p.waitForTimeout(2500);
  ok('nor after a long look at it', !(await adUp(p)));
  await p.close();
  await c.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
