/* Putt Putt Tour: one hole played on its recorded route (--arg 60, or 81:3 for the three star route). */
import { open, hole, playRoute } from './lib/putt.mjs';
export { page, hide } from './lib/putt.mjs';
export const seconds = 30;
export async function setup(page, t) { await open(page, t); await hole(page, t, parseInt(t.arg, 10)); await t.hold(600); }
export async function play(page, t) {
  await t.hold(900);
  await playRoute(page, t, t.arg);
  await t.hold(2600);
  console.log(JSON.stringify(await page.evaluate(() => { const P = window.RTT_PUTT._state().play; return { strokes: P && P.strokes, ace: P && P.cheerAce, name: P && P.C.name }; })));
}
