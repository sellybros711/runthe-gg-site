/*
 * check-draft.mjs - the draft screen's shape, on a desktop and on a phone.
 *
 *   node hoops/check-draft.mjs
 *
 * ── WHY THIS IS ITS OWN FILE ───────────────────────────────────────────────
 *
 * Every other checker here asks whether the game is RIGHT. This one asks
 * whether the screen it is played on is the shape it says it is, and that is a
 * different question with a different failure mode: a layout rule that does
 * not apply throws nothing, logs nothing, and renders a page that looks like a
 * page. The draft shipped at a 660px wrap with the court taking a fixed 316px
 * rail out of it, so on a 1512px monitor the board a player actually reads was
 * drawn 298px wide, narrower than it is on a phone, with the position tabs
 * overflowing and the sort row wrapped onto two lines. Nothing anywhere said
 * so for as long as it shipped.
 *
 * ── THREE THINGS IT HOLDS, AND ALL THREE HAVE ALREADY BEEN WRONG ───────────
 *
 * THE WIDE RULES REALLY MATCH. `.wrap:has(#s-draft.active)` is how the draft
 * gets its width, and the rule was first written `.on`, which is the football
 * game's class and not this one's. It matched nothing: no error, a draft that
 * stayed 660px wide, which is indistinguishable from the bug the block exists
 * to fix. Caught by measuring the wrap rather than by looking at the screen.
 *
 * A MEDIA QUERY ADDS NO SPECIFICITY. The wide block sits about eleven hundred
 * lines above the base rules it argues with, so at equal weight the later one
 * wins. `.sortbar{margin-top:0}` lost that way and kept a 40px hole between
 * two controls that belong together. Worse, the `max-width` block that has
 * always claimed to draw a shorter court on a phone lost it too, for the whole
 * life of the file: the draft court drew at the base 1/0.94 on every phone
 * that ever loaded it. Both are asserted here as MEASUREMENTS of the rendered
 * box, because reading the stylesheet is how you get told what was intended.
 *
 * THE PHONE DID NOT MOVE. The wide layout needs one wrapper in the markup, and
 * a wrapper is exactly the kind of change that quietly costs a margin. Two
 * random drafts are two different boards, so comparing screenshots across runs
 * measures the players; this measures ONE page twice, with the wrapper flat
 * and not, which is a controlled comparison with no seed in it.
 *
 * Every assertion is a PROPERTY, never a pinned pixel: which column a thing is
 * in, how many columns the board has, whether one box is wider than another.
 * Pinning the numbers would make this a test of whichever monitor somebody
 * happened to have.
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

/* Draft screen, one spin in, which is every state this file cares about: the
   board is drawn, the court is drawn, nothing has been signed. */
async function draftPage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-start:not([disabled])', { timeout: 30000 });
  /* The first-time guide covers the button it points at. */
  await page.evaluate(() => { const b = document.querySelector('#frg-x'); if (b) b.click(); });
  await page.evaluate(() => document.querySelector('#b-start').click());
  await page.waitForSelector('#opts .ptile:not(.pending)', { timeout: 30000 });
  await page.waitForTimeout(500);
  return { page, ctx, boom };
}

const geom = (page) => page.evaluate(() => {
  const box = (s) => { const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const opts = document.querySelector('#opts');
  return {
    wrap: box('.wrap'), court: box('#court'), dtop: box('.dtop'), tabs: box('#tabs'),
    opts: box('#opts'), sort: box('.sortbar'), tile: box('#opts .ptile'),
    cols: getComputedStyle(opts).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
    pips: getComputedStyle(document.querySelector('#d-pips')).display,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

const browser = await pw.chromium.launch({ executablePath: CHROME });

// ── 1. the wide layout is football's shape ──────────────────────────────────
section('1. a desktop gets picture left, wheel right, board full width');
{
  const { page, ctx, boom } = await draftPage(browser, 1512, 950);
  const g = await geom(page);

  ok(g.wrap.w > 900, `the draft gets a wide wrap (${Math.round(g.wrap.w)}px)`);
  ok(g.cols === 3, `the board is three columns (${g.cols})`);

  /* PICTURE LEFT, WHEEL RIGHT, SIDE BY SIDE. Two claims, because a court above
     a wheel also satisfies "the court is on the left". */
  ok(g.court.x < g.dtop.x, 'the court is left of the wheel');
  ok(g.court.y < g.dtop.bottom && g.dtop.y < g.court.bottom,
    'and beside it rather than above it');

  /* The whole point of the width: the board is wider than either column. */
  ok(g.opts.w > g.court.w * 1.5, 'the board spans both columns');
  ok(Math.abs(g.tabs.w - g.opts.w) < 2, 'and so does the tab row');
  ok(g.tile.w > 260, `a tile is a readable width (${Math.round(g.tile.w)}px)`);

  /* The pips carry the lineup when the court is out of reach, and here it is
     never out of reach. Football hides them at this width for the same reason. */
  ok(g.pips === 'none', 'the six pips are gone, height and all');

  /* THE CASCADE CLAIMS, both of which have already been lost to a later rule
     of equal weight. Measured off the box, never read out of the sheet. */
  ok(Math.abs(g.opts.right - g.sort.right) < 2,
    'the sort sits at the board\'s right edge');
  ok(g.sort.y - g.tabs.bottom < 30,
    `the sort is not adrift from the tabs (${Math.round(g.sort.y - g.tabs.bottom)}px)`);

  ok(g.overflow === 0, 'nothing hangs off the side');
  ok(boom.length === 0, `no page errors (${boom.join(' | ') || 'none'})`);
  await ctx.close();
}

// ── 2. the breakpoint is clean ──────────────────────────────────────────────
section('2. one pixel either side of the breakpoint, and no width gets neither');
{
  const wide = await draftPage(browser, 920, 900);
  const gw = await geom(wide.page);
  ok(gw.cols === 3, `920 is the wide layout (${gw.cols} columns)`);
  ok(gw.pips === 'none', 'and hides the pips');
  ok(gw.overflow === 0, 'with nothing off the side');
  await wide.ctx.close();

  const narrow = await draftPage(browser, 919, 900);
  const gn = await geom(narrow.page);
  ok(gn.cols === 1, `919 is the single column (${gn.cols})`);
  ok(gn.pips === 'flex', 'and keeps the pips');
  ok(gn.court.y > gn.dtop.y, 'with the court under the wheel, not beside it');
  ok(gn.overflow === 0, 'with nothing off the side');
  await narrow.ctx.close();
}

// ── 3. the phone court is the SHORT one ─────────────────────────────────────
section('3. the court a phone draws is the one the file says it draws');
{
  const { page, ctx } = await draftPage(browser, 390, 844);
  const g = await geom(page);
  /* The rule asks for 1/0.72 and the base rule three hundred lines below asks
     for 1/0.94. For the whole life of the file the base won, so this is the
     one assertion here that was RED before it was written. The band is wide
     because the claim is which of two rules applied, not a pixel count. */
  const aspect = g.court.w / g.court.h;
  ok(aspect > 1.3, `the phone court is the short one (aspect ${aspect.toFixed(2)}, `
    + `${Math.round(g.court.w)}x${Math.round(g.court.h)})`);
  ok(g.cols === 1, 'the board is one column');
  ok(g.overflow === 0, 'nothing hangs off the side');
  await ctx.close();
}

// ── 4. the wrapper costs the phone nothing ──────────────────────────────────
section('4. .dtop changes nothing at a width that does not use it');
{
  for (const [w, h] of [[390, 844], [360, 740], [768, 1024]]) {
    const { page, ctx } = await draftPage(browser, w, h);
    /* ONE PAGE, TWO READINGS. display:contents is exactly "as if the wrapper
       were not there", so anything that moves between them is the wrapper's
       doing and nothing else. Two runs would be two different boards. */
    const read = (flat) => page.evaluate((f) => {
      const el = document.querySelector('.dtop');
      el.style.display = f ? 'contents' : '';
      void document.body.offsetHeight;
      const q = (s) => { const e = document.querySelector(s); if (!e) return 'none';
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100).join(','); };
      return [q('.reels'), q('#d-note2'), q('.btnrow'), q('#tabs'), q('#opts'), q('#court'),
        Math.round(document.body.scrollHeight * 100) / 100].join(' / ');
    }, flat);
    const shipped = await read(false);
    const flat = await read(true);
    ok(shipped === flat, `${w}x${h} is identical with and without the wrapper`);
    await ctx.close();
  }
}

await browser.close();

console.log('');
if (failures.length) {
  console.error(`${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  FAIL: ' + f);
  process.exit(1);
}
console.log(`${passed} assertions passed.`);
