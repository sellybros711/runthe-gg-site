/* The pictures behind the Putt Putt side of the First Tee: one for each world (golf/home/putt-<theme>-d.jpg
 * and -p.jpg), so the home shows the world the player is in.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/build-home-plates.mjs                 every world
 *   node golf/build-home-plates.mjs candy neon      only these (by theme)
 *
 * The home's Pro Tour side is drawn live from today's Play 18 hole. The Putt Putt side is a picture of each
 * world's trail, opened inside the world with every control hidden, cut once here so the home never has to
 * build a 3D world to show one. Re-cut a world when its land or trail changes, cut a new world when one is
 * added, then bump FT_PLATE_V in golf/index.html so a returning player is not shown the old one.
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST || 'http://localhost:8099';
const only = process.argv.slice(2);
const b = await chromium.launch();
for (const [tag, w, h, mobile] of [['d', 1440, 900, false], ['p', 430, 932, true]]){
  const ctx = await b.newContext({ viewport:{ width:w, height:h }, deviceScaleFactor:mobile ? 1.5 : 1, isMobile:mobile, hasTouch:mobile });
  const pg = await ctx.newPage();
  await pg.route(/supabase|googlesyndication|google-analytics|googletagmanager/, r => r.abort());
  await pg.goto(HOST + '/golf/', { waitUntil:'load' });
  await pg.waitForFunction(() => window.RTT_PUTT && typeof openPutt === 'function', null, { timeout:60000 });
  // a tester's view (Putt Putt is testers only before launch), and a new player's save
  await pg.evaluate(() => { sbUser = { id:'plates' }; sbUsername = 'jordantest'; localStorage.removeItem('bag_ppt_v1'); openPutt(); });
  await pg.waitForFunction(() => window.RTT_PUTT._state && window.RTT_PUTT._state() && window.RTT_PUTT._state().screen === 'trail', null, { timeout:60000 });
  // walk to the first trail of each world in turn (world k starts at hole 18k + 1) and read its theme off the
  // trail itself, until the walk runs past the last hole and lands on the map
  for (let k = 0; ; k++){
    await pg.evaluate(n => window.RTT_PUTT._walkTo(n), k * 18 + 1);
    await pg.waitForTimeout(800);
    const theme = await pg.evaluate(() => { const t = document.querySelector('.pt-ov .pp-trail'); return window.RTT_PUTT._state().screen === 'trail' && t ? t.getAttribute('data-wv') : null; });
    if (!theme) break;
    if (only.length && !only.includes(theme)) continue;
    await pg.waitForFunction(() => document.querySelector('.pt-ov [data-tbox] canvas'), null, { timeout:60000 });
    await pg.waitForTimeout(4500);   // the land, the greeter, the title card and the clouds settle
    await pg.evaluate(() => document.querySelectorAll('.pt-ov *').forEach(el => { if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden'; }));
    await pg.waitForTimeout(300);
    await pg.screenshot({ path:new URL(`./home/putt-${theme}-${tag}.jpg`, import.meta.url).pathname, type:'jpeg', quality:70 });
    console.log(`golf/home/putt-${theme}-${tag}.jpg`);
    await pg.evaluate(() => document.querySelectorAll('.pt-ov *').forEach(el => { el.style.visibility = ''; }));
  }
  await ctx.close();
}
await b.close();
