/* Run The Tour, the Pro Tour daily: a round playing on today's championship course, the 3D tracer and
   the hole views, the aggressive line taken at each call. Everything before the first tee shot (the
   course card, building the golfer's eight skills) happens off camera.

   Ported from the play-through scripts/marketing/reference/record-scenes.mjs used on another branch.
   The Putt Putt trailer opens on it: "New in Run The Tour", over the game people already know. */
export const page = '/golf/';
export const seconds = 40;
export const hide = [];

const vis = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
async function press(page, t, sel) { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click({ timeout: 10000 }); await t.hold(900); }

export async function setup(page, t) {
  await t.until(() => [...document.querySelectorAll('button')].some((b) => b.offsetParent && /Play\s*18/i.test(b.textContent)), 60000);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.offsetParent && /Play\s*18/i.test(b.textContent)).click());
  await t.hold(1500);
  await press(page, t, 'text=/SEE TODAY.S COURSE/i');
  await t.hold(800);
  for (const label of ['DRAFT YOUR GOLFER', 'BUILD YOUR GOLFER', 'GOT IT']) if (await vis(page, `text=${label}`)) await press(page, t, `text=${label}`);
  // eight spins, eight skills: each time the golfer's best open skill goes in
  for (let k = 0; k < 8; k++) {
    await t.until(() => !!document.querySelector('.osreel') || document.querySelectorAll('.dtile.open').length > 0 || /TEE OFF AT/i.test(document.body.innerText), 20000);
    if (/TEE OFF AT/i.test(await page.evaluate(() => document.body.innerText))) break;
    if (await vis(page, '.osreel')) { await page.locator('.osreel').first().click(); await t.until(() => document.querySelectorAll('.dtile.open').length > 0, 15000); }
    await t.hold(300);
    await page.evaluate(() => { let b = null, bv = -1; for (const e of document.querySelectorAll('.dtile.open')) { const v = parseInt(e.innerText.match(/(\d+)\s*$/)?.[1] || '0'); if (v > bv) { bv = v; b = e; } } if (b) b.click(); });
    await t.hold(700);
  }
  await t.until(() => /TEE OFF AT/i.test(document.body.innerText), 20000);
  await page.evaluate(() => scrollTo(0, 0));
  await t.hold(600);
}

export async function play(page, t) {
  await t.hold(500);
  await t.tap(page.locator('text=/TEE OFF AT/i').first());
  // the round plays itself; at a decision, the aggressive line
  for (let k = 0; k < 60; k++) {
    if (await vis(page, '.dkc.agg')) { await t.hold(700); await t.tap('.dkc.agg', { before: 250, after: 300 }); }
    await t.hold(500);
  }
}
