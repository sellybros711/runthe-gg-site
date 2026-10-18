/* Putt Putt Tour: a puzzle gym played through on its recorded proof (--arg: the world's theme, pirate by default). */
import { open } from './lib/putt.mjs';
export { page, hide } from './lib/putt.mjs';
export const seconds = 60;
export async function setup(page, t) {
  await open(page, t);
  const f = await page.evaluate((w) => { for (let f = 1; f < 198; f++){ const P = window.RTT_PUTT._trailPlan(f); if (P.spec.gym && P.spec.theme === w) return f; } return 0; }, t.arg || 'pirate');
  if (!f) throw new Error('no gym in ' + (t.arg || 'pirate'));
  await page.evaluate((f) => window.RTT_PUTT._walkTo(f), f);   // _walkTo(n) is the trail that leaves hole n
  await t.until(() => !!window.RTT_PUTT._trail(), 60000);
  await page.evaluate(() => { const T = window.RTT_PUTT._trail(), G = T.plan().gym; T.goTo(G.ax, G.ay + 0.25); });   // on the gate line, off camera: the clip opens as he steps in
  await t.hold(900);
}
export async function play(page, t) {
  await t.hold(400);
  for (let i = 0; i < 40; i++) { const inn = await page.evaluate(() => { const T = window.RTT_PUTT._trail(); T.stick(0, -1); return T.gym().in; }); if (inn) break; await t.hold(80); }
  await page.evaluate(() => window.RTT_PUTT._trail().stick(0, 0));
  await t.until(() => !window.RTT_PUTT._trail().gymBusy(), 10000);
  await t.hold(700);
  const proof = await page.evaluate(() => { const g = window.RTT_PUTT._trail().gym(); return window.RTT_PUTT_GYMS.proof(g.G); });
  const tap = await page.evaluate(() => window.RTT_PUTT_GYMS.input(window.RTT_PUTT._trail().gym().G) === 'tap');
  for (const d of proof) {
    await t.until(() => !window.RTT_PUTT._trail().gymBusy(), 10000);
    await page.evaluate(([d, tap]) => { const T = window.RTT_PUTT._trail(); tap ? T.gymTap(d) : T.gymStep(d); }, [d, tap]);
    await t.hold(120);
  }
  await t.until(() => !window.RTT_PUTT._trail().gymBusy(), 10000);
  await t.hold(2500);
  console.log(JSON.stringify(await page.evaluate(() => { const g = window.RTT_PUTT._trail().gym(); return { solved: g.solved, steps: window.RTT_PUTT_GYMS.proof(g.G).length }; })));
}
