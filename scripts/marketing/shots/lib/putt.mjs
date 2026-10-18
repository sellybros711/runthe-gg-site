/* Putt Putt Tour on camera: the things every Putt Putt shot does, so each shot is only its moment.

   THE PLAYER IS A STAND-IN. A guest walks only to hole 1, so a clip of anything further needs a signed-in
   player who has the holes open. The shot signs in as a made-up account id (no username, so no handle
   is ever drawn) with a save that has met every world's greeter, and turns on the host's all-access
   switch, the one the page keeps for its testers (PUTT_ALL_ACCESS), on this page only. Nothing reaches a
   server: the recorder serves the site from disk and refuses every other host.

   EVERY SHOT IS REAL PLAY. A hole is played with the solver's own recorded route (routes.json), the
   hole's clock set to the route's time at each strike so the moving pieces stand where the solver
   had them; an ace on screen is an ace the hole really gives. The golfer walks the trail on the stick,
   the way a thumb walks him. A gym is played with its recorded proof, one step at a time. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const ROUTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'golf/putt/routes.json'), 'utf8'));
export const page = '/golf/';
export const hide = [];

/* Into Putt Putt as the stand-in, with every hole open. */
export async function open(page, t) {
  await t.until(() => window.RTT_PUTT && window.RTT_PUTT_3D && typeof openPutt === 'function', 60000);
  await page.evaluate(() => {
    const met = (window.RTT_PUTT.WORLDS || []).map((w) => w.theme || w.id).filter(Boolean);
    sbUser = { id: 'trailer' };
    localStorage.setItem('bag_ppt_v1@trailer', JSON.stringify({ v: 2, met, tours: { main: { lv: 198, best: {}, ace: {}, paid: {}, wpaid: {} } } }));
    openPutt();
    window.RTT_PUTT._state().host.allAccess = () => true;
  });
  await t.hold(1500);
}

/* The trail that leaves hole n (into n + 1), ready to walk. */
export async function trail(page, t, n) {
  await page.evaluate((n) => window.RTT_PUTT._walkTo(n), n);
  await t.until(() => !!window.RTT_PUTT._trail(), 60000);
  await t.hold(800);
}

/* Walk him up the path for ms, steering for the middle of it a few steps ahead, as a thumb would. */
export async function walk(page, t, ms, ahead = 3) {
  const end = Date.now();
  for (let left = ms; left > 0; left -= 100) {
    await page.evaluate((ahead) => {
      const T = window.RTT_PUTT._trail(); if (!T) return;
      const P = T.plan(), [x, y] = T.pos(), ty = y - ahead, tx = P.cx ? P.cx(Math.max(0, ty)) : x;
      const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
      T.stick(dx / d, dy / d);
    }, ahead);
    await t.hold(100);
  }
  await page.evaluate(() => { const T = window.RTT_PUTT._trail(); if (T) T.stick(0, 0); });
  void end;
}

/* Walk him to a point on the trail (a chest, a gym's gate), steering straight at it. */
export async function walkTo(page, t, x, y, maxMs = 6000, near = 0.6) {
  for (let left = maxMs; left > 0; left -= 100) {
    const d = await page.evaluate(([x, y]) => {
      const T = window.RTT_PUTT._trail(); const [gx, gy] = T.pos(), dx = x - gx, dy = y - gy, d = Math.hypot(dx, dy);
      if (d > 0.01) T.stick(dx / d, dy / d); return d;
    }, [x, y]);
    if (d < near) break;
    await t.hold(100);
  }
  await page.evaluate(() => window.RTT_PUTT._trail().stick(0, 0));
}

/* Hole n, loaded and waiting at address. */
export async function hole(page, t, n) {
  await page.evaluate((n) => window.RTT_PUTT._level(n), n);
  await t.until(() => { const P = window.RTT_PUTT._state().play; return P && P.v3 && P.v3.cv && P.state === 'aim'; }, 120000);
}

/* Play a recorded route: aim, a pull back the viewer can see, then the strike at the route's clock time. */
export async function playRoute(page, t, key, { aimMs = 900 } = {}) {
  const route = ROUTES['main:' + key];
  if (!route) throw new Error(`no route main:${key}`);
  for (const [ang, ft, at] of route) {
    await t.until(() => { const P = window.RTT_PUTT._state().play; return P && P.state === 'aim'; }, 30000);
    // the aim swings round to the line, and the power builds, over aimMs
    const steps = Math.max(1, Math.round(aimMs / 100));
    const a0 = await page.evaluate(() => window.RTT_PUTT._state().play.aimAng || 0);
    for (let i = 1; i <= steps; i++) {
      await page.evaluate(([a0, ang, ft, k]) => {
        const P = window.RTT_PUTT._state().play; let da = ang - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        P.aimAng = a0 + da * Math.min(1, k * 1.6); P.pow = Math.min(1, ft / 42) * k;
      }, [a0, ang, ft, i / steps]);
      await t.hold(100);
    }
    // the strike, with the hole's clock at the route's time (the page's clock runs at PLAY_RATE 1.45)
    await page.evaluate(([ang, ft, at]) => {
      const P = window.RTT_PUTT._state().play; P.clock0 = performance.now() * 1.45 / 1000 - at; window.RTT_PUTT._putt(ang, ft);
    }, [ang, ft, at]);
    await t.until(() => { const P = window.RTT_PUTT._state().play; return P && P.state !== 'roll'; }, 30000);
  }
}
