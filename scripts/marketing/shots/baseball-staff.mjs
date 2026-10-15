/* Run The Diamond, All-Time Pitching Staff: twelve spins, twelve arms, then the season.
   Every take is a different draft, so record a few and keep the best.

   THE STAFF STAYS ON SCREEN. The point of the clip is watching a rotation and a bullpen fill up,
   and at the default 432x768 the board scrolled away every time a card was tapped (the owner,
   2026-10-15: "make sure you can see the lineup you are drafting"). At 504x896 the money line, the
   whole staff board, the reels and the first two rows of cards all fit, and the board is sorted by
   WAR, so the arm worth taking is nearly always already in view. */
export const page = '/baseball/';
export const seconds = 90;
export const viewport = { width: 504, height: 896 };
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
    await t.hold(700);
    // The best arm by WAR that still leaves about $5M for every spot after it, taken from the cards
    // already on screen when one of them fits, so the board above never scrolls away.
    const best = await page.evaluate(() => {
      const txt = document.body.innerText;
      const money = +((txt.match(/MONEY LEFT[\s\S]*?\$([\d.]+)M/i) || [])[1] || 0);
      const spin = +((txt.match(/SPIN (\d+) OF 12/i) || [])[1] || 12);
      const keep = 5 * (12 - spin);
      const all = [...document.querySelectorAll('.opts button.tile')].filter((b) => b.offsetParent && !b.disabled);
      const pick = (inView) => {
        let best = -1, bestWar = -99;
        all.forEach((b, i) => {
          const r = b.getBoundingClientRect();
          if (inView && r.bottom > innerHeight - 8) return;
          const pay = parseFloat(b.innerText.match(/\$([\d.]+)M/)?.[1] || '999');
          const war = parseFloat(b.innerText.match(/(-?[\d.]+)\s*WAR/)?.[1] || '-99');
          if (pay <= money - keep && war > bestWar) { best = i; bestWar = war; }
        });
        return best;
      };
      const seen = pick(true);
      return seen >= 0 ? seen : pick(false);
    });
    if (best < 0) throw new Error('nobody on the board fits the cap, take another');
    await t.tap(tiles(page).nth(best), { before: 450, after: 200 });
    // Back to the top if that card needed a scroll, so the arm is seen landing in his slot.
    if (await page.evaluate(() => scrollY > 0)) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
      await t.hold(500);
    }
    await t.hold(600);
  }
  // The staff on the squad screen, then the season at full speed, then October to the end.
  await t.hold(1500);
  await t.tap('#b-playball');
  await t.until(() => { const b = document.getElementById('b-sim-fast'); return b && b.offsetParent; }, 30000);
  await t.hold(1200);
  await t.tap('#b-sim-fast');
  await t.hold(3500);
  for (let n = 0; n < 60 && !(await page.$('#s-over.on')); n++) {
    const next = page.locator('#b-season-go:visible, #b-brk-skip:visible, #sr-simall:visible, #gm-simall:visible, #sr-sim:visible').first();
    if (await next.count()) await t.tap(next, { before: 400, after: 1200 }); else await t.hold(400);
  }
  await t.hold(3500);
  // The result, so a take can be picked without watching every one.
  console.log((await page.locator('#s-over').innerText()).split('\n').slice(0, 4).join(' · '));
}
