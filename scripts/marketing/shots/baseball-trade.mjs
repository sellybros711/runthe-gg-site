/* Run The Diamond, the Trade Machine: a roster you did not pick, the phone ringing at each
   deadline, a deal taken every time, then the season and October to the end. */
export const page = '/baseball/';
export const seconds = 90;
// No network on a recording: without this the results screen says the leaderboard is unreachable.
export const hide = ['/baseball/board.js'];

export async function setup(page, t) {
  await t.hold(3500);
}

/* The offer that adds the most WAR among the ones the cap allows. */
const bestOffer = (page) => page.evaluate(() => {
  const all = [...document.querySelectorAll('#trade-list button.offer')];
  let best = -1, gain = -99;
  all.forEach((b, i) => {
    const g = parseFloat((b.querySelector('.of-gain') || {}).textContent || '-99');
    if (!b.disabled && g > gain) { best = i; gain = g; }
  });
  return best;
});

export async function play(page, t) {
  await t.hold(700);
  await t.tap(page.locator('button:visible').filter({ hasText: /More ways to play/i }).first());
  await t.hold(600);
  await t.tap(page.locator('[data-mode=trade]:visible').first());
  // The roster you were handed, long enough to read who is on it.
  await t.until(() => /YOUR ROSTER IS SET/i.test(document.body.innerText), 20000);
  await t.hold(2500);
  await t.tap('#b-playball');
  // Counted in steps, not the machine's clock: the recorder runs the page on its own time.
  let fast = false;
  for (let n = 0; n < 200 && !(await page.$('#s-over.on')); n++) {
    if (await page.$('#sheet-trade.on')) {
      await t.hold(1600);
      const i = await bestOffer(page);
      if (i >= 0) await t.tap(page.locator('#trade-list button.offer').nth(i), { before: 500, after: 900 });
      else await t.tap('#b-trade-pass', { after: 900 });
      continue;
    }
    if (!fast && await page.locator('#b-sim-fast:visible').count()) { await t.tap('#b-sim-fast'); fast = true; continue; }
    const next = page.locator('#b-season-go:visible, #b-brk-skip:visible, #sr-simall:visible, #gm-simall:visible, #sr-sim:visible').first();
    if (await next.count()) await t.tap(next, { before: 400, after: 1200 }); else await t.hold(300);
  }
  await t.hold(3500);
  // The result, so a take can be picked without watching every one.
  console.log((await page.locator('#s-over').innerText()).split('\n').slice(0, 4).join(' · '));
}
