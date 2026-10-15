/* Run The Diamond, All-Time Pitching Staff: twelve spins, twelve arms, then the season.
   Every take is a different draft, so record a few and keep the best. */
export const page = '/baseball/';
export const seconds = 90;
// No network on a recording: without this the results screen says the leaderboard is unreachable.
export const hide = ['/baseball/board.js'];

const tiles = (page) => page.locator('.opts button.tile:visible:not([disabled])');

export async function setup(page, t) {
  await t.hold(3500);
}

export async function play(page, t) {
  await t.hold(700);
  await t.tap(page.locator('button:visible').filter({ hasText: /More ways to play/i }).first());
  await t.hold(600);
  await t.tap(page.locator('[data-mode=staff]:visible').first());
  for (let pick = 0; pick < 12; pick++) {
    // The reels land, then the board fills: wait for that instead of a fixed pause.
    await t.until((n) => {
      const box = document.getElementById('box-t');
      const ready = [...document.querySelectorAll('.opts button.tile')].some((b) => b.offsetParent && !b.disabled);
      return ready && box && !/waiting/.test(box.className) && new RegExp('SPIN ' + n + ' OF', 'i').test(document.body.innerText);
    }, 15000, pick + 1);
    await t.hold(500);
    // The best arm by WAR that still leaves about $5M for every spot after it.
    const best = await page.evaluate(() => {
      const txt = document.body.innerText;
      const money = +((txt.match(/MONEY LEFT[\s\S]*?\$([\d.]+)M/i) || [])[1] || 0);
      const spin = +((txt.match(/SPIN (\d+) OF 12/i) || [])[1] || 12);
      const keep = 5 * (12 - spin);
      const all = [...document.querySelectorAll('.opts button.tile')].filter((b) => b.offsetParent && !b.disabled);
      let best = -1, bestWar = -99;
      all.forEach((b, i) => {
        const pay = parseFloat(b.innerText.match(/\$([\d.]+)M/)?.[1] || '999');
        const war = parseFloat(b.innerText.match(/(-?[\d.]+)\s*WAR/)?.[1] || '-99');
        if (pay <= money - keep && war > bestWar) { best = i; bestWar = war; }
      });
      return best;
    });
    if (best < 0) throw new Error('nobody on the board fits the cap, take another');
    await t.tap(tiles(page).nth(best), { before: 350, after: 250 });
  }
  // The staff on the squad screen, then the season at full speed, then October to the end.
  await t.hold(1500);
  await t.tap('#b-playball');
  await t.until(() => { const b = document.getElementById('b-sim-fast'); return b && b.offsetParent; }, 30000);
  await t.hold(1200);
  await t.tap('#b-sim-fast');
  await t.hold(3500);
  const end = Date.now() + 40000;
  while (Date.now() < end && !(await page.$('#s-over.on'))) {
    const next = page.locator('#b-season-go:visible, #b-brk-skip:visible, #sr-simall:visible, #gm-simall:visible, #sr-sim:visible').first();
    if (await next.count()) await t.tap(next, { before: 400, after: 1200 }); else await t.hold(300);
  }
  await t.hold(3500);
  // The result, so a take can be picked without watching every one.
  console.log((await page.locator('#s-over').innerText()).split('\n').slice(0, 4).join(' · '));
}
