/* MORE WAYS TO PLAY IS A GRID ON A WIDE SCREEN AND A LIST ON A PHONE.
 *
 *   (python3 -m http.server 8080 &) ; node scripts/check-modes-grid.mjs
 *   node scripts/check-modes-grid.mjs http://localhost:8081
 *
 * The NFL and college games' modes sheets were asked to match the baseball game's: tiles,
 * two across once the sheet has room and three once it is wide. Every way that breaks
 * renders perfectly, so this measures the glass rather than reading the CSS:
 *
 *   - the columns are COUNTED off the tiles' own left edges, at three widths
 *   - a phone is still one column, because the request was desktop only
 *   - the tiles in a row are ONE HEIGHT, which is the property a grid buys and a list of
 *     cards of different lengths does not have
 *   - the wider sheet does not LEAK. Every sheet on both pages draws into one #sheet-in, so
 *     the width is keyed on :has(.mc-grid) rather than on a flag modeMenu writes. This opens
 *     the modes sheet and then redraws the pane with something else, and asserts the next
 *     sheet is back at its own width.
 *
 * Nothing leaves the machine: every request that is not to the local server is aborted, so
 * no Supabase call and no Stripe call can be made from here.
 */
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';
const pw = await import(PW);
const { chromium } = pw.default || pw;
const HOST = process.argv[2] || 'http://localhost:8080';

let bad = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? '   ' + detail : ''}`);
  if (!pass) bad++;
};

/* Each game's own door, the sheet's own Close, and the How to play button, which redraws the
   same pane with a sheet modeMenu does not draw. Pressed rather than called, because a guard
   that reaches into the page's functions is testing a path no player takes. */
const GAMES = [
  { name: 'The Perfect Season', path: '/football/', door: '#b-teams', close: '#b-mc-x' },
  { name: 'Perfect College Season', path: '/cfb/', door: '#b-modes', close: '#mm-x' },
];

async function openSheet(page, game, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(HOST + game.path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  /* The first-time guide covers the door on a first visit. */
  for (const t of ['No thanks', 'Got it', 'Skip']) {
    const l = page.getByRole('button', { name: new RegExp(t, 'i') }).first();
    if (await l.isVisible().catch(() => false)) { await l.click().catch(() => {}); await page.waitForTimeout(250); }
  }
  await page.locator(game.door).scrollIntoViewIfNeeded();
  await page.locator(game.door).click();
  await page.waitForSelector('#sheet.on #sheet-in .modecard', { timeout: 8000 });
  await page.waitForTimeout(500);   /* the sheet's own open transition */
}

/* Tiles of the MODES list, not the cross promo: that one is its own row and can hold fewer
   cards than there are columns. Rows are grouped by offsetTop, which is the laid out box and
   ignores the hover and press transforms. */
const measure = (page) => page.evaluate(() => {
  const list = document.querySelector('#sheet-in .modecards');
  const tiles = [...list.children].filter((e) => e.classList.contains('modecard'));
  const lefts = [...new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().left)))];
  const rows = {};
  tiles.forEach((t) => { (rows[t.offsetTop] = rows[t.offsetTop] || []).push(t.offsetHeight); });
  const ragged = Object.values(rows).filter((hs) => hs.length > 1 && Math.max(...hs) - Math.min(...hs) > 1);
  return {
    tiles: tiles.length,
    cols: lefts.length,
    ragged: ragged.length,
    sheet: Math.round(document.getElementById('sheet-in').getBoundingClientRect().width),
  };
});

const browser = await chromium.launch();
for (const game of GAMES) {
  console.log(`\n${game.name.toUpperCase()}`);
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route((u) => !u.href.startsWith(HOST), (r) => r.abort());

  /* EXPECTED COLUMNS ARE CAPPED BY THE TILES THERE ARE. A signed out college visitor gets
     two mode tiles (the sign-in card spans its own row), so three across is asked of them
     as "every tile on one row". */
  for (const [w, h, want, label] of [[1440, 900, 3, 'a desktop'], [700, 900, 2, 'a narrow window'], [390, 844, 1, 'a phone']]) {
    await openSheet(page, game, w, h);
    const m = await measure(page);
    const expect = Math.min(want, m.tiles);
    ok(`${label} (${w}px) gets ${expect === 1 ? 'the list' : expect + ' across'}`,
      m.cols === expect, `${m.cols} column${m.cols === 1 ? '' : 's'}, ${m.tiles} tiles, sheet ${m.sheet}px`);
    if (want > 1) ok(`  and the tiles in a row are one height`, m.ragged === 0, `${m.ragged} ragged rows`);
    if (want === 1) ok(`  and the sheet is the width it always was`, m.sheet <= 560, `${m.sheet}px`);
  }

  /* THE LEAK. Open the grid at desktop width, then redraw the pane with another sheet. */
  await openSheet(page, game, 1440, 900);
  const wide = await measure(page);
  await page.locator(game.close).click();
  await page.waitForTimeout(500);
  await page.locator('#b-how').scrollIntoViewIfNeeded();
  await page.locator('#b-how').click();
  await page.waitForSelector('#sheet.on', { timeout: 8000 });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    grid: !!document.querySelector('#sheet-in .mc-grid'),
    w: Math.round(document.getElementById('sheet-in').getBoundingClientRect().width),
  }));
  ok('the next sheet drawn in the pane is back at its own width',
    wide.sheet > 700 && !after.grid && after.w <= 560, `${wide.sheet}px, then ${after.w}px`);
  ok('nothing threw', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');
  await ctx.close();
}
await browser.close();
console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
