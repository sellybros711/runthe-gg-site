/* The pictures behind the Putt Putt side of the First Tee (golf/home/putt-world-d.jpg and -p.jpg).
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/build-home-plates.mjs
 *
 * The home's Pro Tour side is drawn live from today's Play 18 hole. The Putt Putt side is a picture of the
 * world, opened as a new player sees it with every control hidden, cut once here so the home never has to
 * build a 3D world to show one. Re-cut it when the Clubhouse's land or trail changes, then bump FT_PLATE_V
 * in golf/index.html so a returning player is not shown the old one.
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST || 'http://localhost:8099';
const b = await chromium.launch();
for (const [tag, w, h, mobile] of [['d', 1440, 900, false], ['p', 430, 932, true]]){
  const ctx = await b.newContext({ viewport:{ width:w, height:h }, deviceScaleFactor:mobile ? 1.5 : 1, isMobile:mobile, hasTouch:mobile });
  const pg = await ctx.newPage();
  await pg.route(/supabase|googlesyndication|google-analytics|googletagmanager/, r => r.abort());
  await pg.goto(HOST + '/golf/', { waitUntil:'load' });
  await pg.waitForFunction(() => window.RTT_PUTT && typeof openPutt === 'function', null, { timeout:60000 });
  await pg.evaluate(() => { localStorage.removeItem('bag_ppt_v1'); openPutt(); });
  await pg.waitForFunction(() => window.RTT_PUTT._state && window.RTT_PUTT._state().screen === 'trail', null, { timeout:60000 });
  await pg.waitForTimeout(4000);   // the land, the greeter and the clouds settle
  await pg.evaluate(() => document.querySelectorAll('.pt-ov *').forEach(el => { if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden'; }));
  await pg.waitForTimeout(300);
  await pg.screenshot({ path:new URL(`./home/putt-world-${tag}.jpg`, import.meta.url).pathname, type:'jpeg', quality:72 });
  console.log(`golf/home/putt-world-${tag}.jpg`);
  await ctx.close();
}
await b.close();
