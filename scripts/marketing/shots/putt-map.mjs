/* Putt Putt Tour: the Tour map, scrolled from the first hole up the path through the worlds. */
import { open } from './lib/putt.mjs';
export { page, hide } from './lib/putt.mjs';
export const seconds = 20;
const RISE_MS = +process.env.MAP_MS || 10000;
export async function setup(page, t) {
  await open(page, t);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^\s*map\s*$/i.test(x.textContent)); b.click(); });
  await t.until(() => { const m = document.querySelector('.pp-map'); return m && m.scrollHeight > m.clientHeight; }, 20000);
  await page.evaluate(() => { const m = document.querySelector('.pp-map'); m.scrollTop = m.scrollHeight; });
  await t.hold(1200);
}
export async function play(page, t) {
  await t.hold(600);
  // eased by the page's own frames, so the scroll is as smooth as the recording
  await page.evaluate((ms) => { const m = document.querySelector('.pp-map'), y0 = m.scrollTop, t0 = performance.now();
    const ease = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    (function f(){ const k = Math.min(1, (performance.now() - t0) / ms); m.scrollTop = y0 * (1 - ease(k)); if (k < 1) requestAnimationFrame(f); })(); }, RISE_MS);
  await t.hold(RISE_MS + 900);
}
