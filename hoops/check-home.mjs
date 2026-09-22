/*
 * check-home.mjs - how far a player scrolls before the front page is over.
 *
 *   node hoops/check-home.mjs
 *
 * ── WHY THIS IS ITS OWN FILE ───────────────────────────────────────────────
 *
 * The front page carried two open cards of prose at the bottom of it, "How a
 * run goes" and "Why six stars lose", and between them they were 1,682px of a
 * 3,082px page at 390 and 1,846 of 3,236 at 360. MORE THAN HALF THE HOME
 * SCREEN WAS AN ESSAY, on every visit, for as long as somebody kept playing.
 * Reported by a player as too much to scroll.
 *
 * Nothing could report it and nothing did. The cards rendered, the words were
 * right, and length is not a thing any other checker here asks about: verify
 * asks whether the game is correct, check-draft asks whether one screen is
 * the shape it claims, and neither of them has an opinion about how long a
 * page is. So this one measures the page in SCREENS of the viewport, because
 * 1.7 screens is the complaint answered and 1,450px is a number.
 *
 * ── WHAT IT HOLDS ──────────────────────────────────────────────────────────
 *
 * THE CARD IS SHUT ON ARRIVAL. That is the whole of the fix: the prose is one
 * folded card now, and the only way the page goes back to four screens is for
 * somebody to open it by default or take the fold out.
 *
 * FOLDED IS NOT HIDDEN. The comment that used to sit over the second card
 * argued that a game page whose every word arrives after a click reads as
 * empty to a crawler and to a reviewer, and that argument survives a details
 * element and would not survive the obvious alternative, which is to move the
 * text to the rules page and link it. So the words are COUNTED in the DOM
 * while the card is shut, which is the property that alternative breaks.
 *
 * THE CEILING IS A BAND, NOT A PIXEL. Two screens at a phone width is what
 * this page should cost: the doors, the league, and the fold. It is measured
 * at the two narrow widths that actually bind and at a desktop, because the
 * defect was worst at 360 and this page is read on a phone.
 *
 * NOTHING HERE REACHES A NETWORK. Every request off local.test is refused.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const pw = createRequire('/opt/node22/lib/node_modules/')('playwright');

const failures = [];
let passed = 0;
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
async function serve(route) {
  const u = new URL(route.request().url());
  if (u.hostname !== 'local.test') return route.abort();
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return route.abort();
  await route.fulfill({ status: 200,
    contentType: TYPES[path.extname(f)] || 'application/octet-stream',
    body: fs.readFileSync(f) });
}

async function homePage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-start:not([disabled])', { timeout: 30000 });
  /* The first-time guide is a scrim over the whole page and it is correct: it
     is not what this file is about, and it is dismissed the same way a reader
     dismisses it. */
  await page.evaluate(() => { const b = document.querySelector('#frg-x'); if (b) b.click(); });
  await page.waitForTimeout(300);
  return { page, ctx, boom };
}

const browser = await pw.chromium.launch({ executablePath: CHROME });

// ── 1. the front page fits ──────────────────────────────────────────────────
section('1. the front page is about two screens, on the widths that bind');
{
  /* 360 is narrower AND shorter, so it is the worst case and not 320: what
     costs screens here is prose reflowing into more lines against a viewport
     with fewer pixels to spend on them. Measured before this pass: 3.65
     screens at 390 and 4.37 at 360. */
  for (const [w, h] of [[390, 844], [360, 740], [1512, 950]]) {
    const { page, ctx, boom } = await homePage(browser, w, h);
    const g = await page.evaluate(() => ({
      page: document.documentElement.scrollHeight,
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    const screens = g.page / h;
    ok(screens < 2.4, `${w}x${h}: ${screens.toFixed(2)} screens (${g.page}px)`);
    ok(g.over === 0, `${w}x${h}: nothing hangs off the side`);
    ok(boom.length === 0, `${w}x${h}: no page errors (${boom.join(' | ') || 'none'})`);
    await ctx.close();
  }
}

// ── 2. the fold, and the words behind it ────────────────────────────────────
section('2. one shut card, with the prose in the DOM while it is shut');
{
  const { page, ctx } = await homePage(browser, 390, 844);
  const g = await page.evaluate(() => {
    const folds = [...document.querySelectorAll('#s-home details')];
    const ht = document.querySelector('#home-howto');
    /* Read WHILE SHUT. A details keeps its contents in the tree either way,
       which is the entire reason this is a fold rather than a link to the
       rules page, so the count is taken before anything is opened. */
    const words = ht ? (ht.textContent || '').trim().split(/\s+/).length : 0;
    /* Any card on this screen still carrying a wall of prose in the open. */
    const openProse = [...document.querySelectorAll('#s-home > .card')]
      .filter(c => c.tagName !== 'DETAILS'
        && (c.textContent || '').trim().split(/\s+/).length > 90)
      .map(c => (c.querySelector('h2') || c).textContent.trim().slice(0, 30));
    const sum = ht && ht.querySelector('summary');
    const r = sum ? sum.getBoundingClientRect() : { height: 0 };
    return { n: folds.length, open: ht ? ht.open : null, words, openProse,
      head: sum ? (sum.querySelector('h2') || {}).textContent : null,
      tap: Math.round(r.height) };
  });

  ok(g.n === 1, `one folded card on the home screen (${g.n})`);
  ok(g.open === false, 'and it is shut when the page arrives');
  ok(/how to play/i.test(g.head || ''), `headed How to play ("${(g.head || '').trim()}")`);
  /* The two cards it replaced ran to about 460 words between them. */
  ok(g.words > 350, `the prose is in the DOM while it is shut (${g.words} words)`);
  ok(g.openProse.length === 0,
    `nothing else on the screen is a wall of text (${g.openProse.join(', ') || 'none'})`);
  ok(g.tap >= 44, `the summary is a real tap target (${g.tap}px)`);

  /* IT OPENS, which is not as obvious as it reads: the summary carries an h2,
     and a heading is a block that will happily sit across the marker and eat
     the press if it is not told to share the row. */
  await page.evaluate(() => document.querySelector('#home-howto summary').click());
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => {
    const ht = document.querySelector('#home-howto');
    return { open: ht.open, h: Math.round(ht.getBoundingClientRect().height),
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      /* Both halves are in there, the second one under its own turn. */
      turn: !!ht.querySelector('.ht-turn'),
      rules: !!ht.querySelector('a[href*="how-to-play"]') };
  });
  ok(after.open === true, 'pressing the heading opens it');
  ok(after.h > 800, `and there is a card's worth behind it (${after.h}px)`);
  ok(after.turn, 'with the second half under its own heading');
  ok(after.rules, 'and the full rules still linked from the end of it');
  ok(after.over === 0, 'open, nothing hangs off the side');
  await ctx.close();
}

await browser.close();

console.log('');
if (failures.length) {
  console.error(`${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  FAIL: ' + f);
  process.exit(1);
}
console.log(`${passed} assertions passed.`);
