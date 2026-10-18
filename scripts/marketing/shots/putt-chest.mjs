/* Putt Putt Tour: a chest found off the path and opened, and its coins walked over (--arg: the trail into that hole). */
import { open, trail, walkTo } from './lib/putt.mjs';
export { page, hide } from './lib/putt.mjs';
export const seconds = 20;
export async function setup(page, t) {
  await open(page, t); await trail(page, t, parseInt(t.arg, 10));
  // off camera: put him a few steps short of the chest, so the clip is the find, not the walk
  await page.evaluate(() => { const T = window.RTT_PUTT._trail(), c = T.items().find((i) => i.k === 'chest' && !i.main && !i.done) || T.items().find((i) => i.k === 'chest');
    window.__chest = c.id; T.warp(c.x, c.y + 5.5); });
  await t.hold(900);
}
export async function play(page, t) {
  await t.hold(500);
  const c = await page.evaluate(() => { const c = window.RTT_PUTT._trail().items().find((i) => i.id === window.__chest); return { x: c.x, y: c.y }; });
  await walkTo(page, t, c.x, c.y + 2.0, 4000, 0.3);
  await t.hold(2600);
  // over the coins it threw, nearest first
  for (let k = 0; k < 5; k++) {
    const n = await page.evaluate(() => { const T = window.RTT_PUTT._trail(), [x, y] = T.pos(); const cs = T.items().filter((i) => i.k === 'coin' && i.out && !i.done)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)); return cs[0] ? { x: cs[0].x, y: cs[0].y } : null; });
    if (!n) break;
    await walkTo(page, t, n.x, n.y, 2000, 0.25);
  }
  await t.hold(1200);
}
