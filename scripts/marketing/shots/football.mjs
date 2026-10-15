/* The Perfect Season: six spins, six signings, then the season plays out to its record.
   Every take is a different draft and a different season, so record a few and keep the best. */
export const page = '/football/';
export const seconds = 75;

const rows = (page) => page.locator('button:visible:not([disabled])').filter({ hasText: /\d+ yrs/ });

export async function setup(page, t) {
  await t.hold(4000);
  // The first-run card, if this page shows one, is answered off camera.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /NO THANKS|I WILL TRY IT/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await t.hold(800);
}

export async function play(page, t) {
  await t.hold(900);
  await t.tap(page.locator('button:visible').filter({ hasText: /Draft your offense/i }).first());
  let rerolls = 0;
  for (let pick = 0; pick < 6; pick++) {
    await t.hold(2400);
    const state = await page.evaluate(() => {
      const txt = document.body.innerText;
      return { money: +((txt.match(/MONEY LEFT[\s\S]*?\$([\d.]+)M/i) || [])[1] || 0), spin: +((txt.match(/SPIN (\d+) OF 6/i) || [])[1] || 6) };
    });
    // The biggest contract that still leaves about $4M for every spot after it: the cap squeeze
    // shows, and the last spin is never left with nobody it can afford.
    const keep = 4 * (6 - state.spin);
    const all = rows(page);
    let best = -1, bestPay = -1;
    for (let i = 0, n = await all.count(); i < n; i++) {
      const text = (await all.nth(i).textContent()) || '';
      // The card says when it cannot be signed: the spot is taken or the money is not there.
      if (/spot is filled|No spot left|left to spend/i.test(text)) continue;
      const pay = parseFloat(text.match(/\$([\d.]+)M/)?.[1] || '0');
      if (pay <= state.money - keep && pay > bestPay) { best = i; bestPay = pay; }
    }
    if (best < 0 && rerolls++ < 2) {
      // Nobody on this team fits: a new team, the way a player would. It comes off the budget.
      await t.tap(page.locator('button:visible').filter({ hasText: /New team/i }).first());
      pick--;
      continue;
    }
    if (best < 0) throw new Error('nobody on the board fits the cap, take another');
    await t.tap(all.nth(best), { before: 500, after: 300 });
  }
  await t.hold(1200);
  await t.tap(page.locator('button:visible').filter({ hasText: /Play the season/i }).first());
  // A few weeks go by at the page's own pace, then a tap skips to the record.
  await t.hold(6000);
  const skip = page.locator('button:visible').filter({ hasText: /Skip to the end/i }).first();
  if (await skip.count()) await t.tap(skip);
  await t.until(() => /SEASON COMPLETE/i.test(document.body.innerText), 40000);
  await t.hold(2500);
}
