/* SCREENSHOTS OF EVERY SCREEN IN THE MODE, for looking at rather than asserting on.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/shots.mjs
 *
 * The regression tests take a shot each as they pass through, which is enough to catch a
 * screen that has stopped rendering and no use at all for judging whether a screen can be
 * read. This drives one term deliberately and captures the office, the desk, a reaction and
 * the year in review at two widths, full height, so the whole of each is in one image.
 */
import { chromium } from 'playwright';
const OUT = process.env.SHOT_DIR
  || '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const URL = 'http://localhost:8080/cfb/commish/index.html';
const UID = '11111111-1111-1111-1111-111111111111';
const TESTER = 'commish-test-account';

const stub = `
window.supabase={createClient(){
  const session={access_token:'x',user:{id:'${UID}',email:'c@e.com'}};
  return {auth:{onAuthStateChange(){return{data:{}}},
    getSession:()=>Promise.resolve({data:{session}}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:{username:'${TESTER}'}})}}}}}},
    rpc:()=>Promise.resolve({data:true,error:null})}}};`;
const arm = `
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify(TESTER)}); }catch(e){} }});
})();`;


/* THE SIMULATION SITS BETWEEN THE OFFICE AND THE DESK NOW. Pressing on walks the days of the
   beat before anything lands, which is the point of it and which every walker in these tests
   would otherwise sit through or, worse, time out on. Tapping it skips to the end. */
async function skipSim(pg) {
  for (let i = 0; i < 60; i++) {
    const up = await pg.$eval('#off-monthcard', (e) => e.classList.contains('running')).catch(() => false);
    if (!up) return;
    await pg.click('#off-monthcard', { timeout: 1500 }).catch(() => {});
    await pg.waitForTimeout(110);
  }
}

/* THE ONE SCREEN THAT ONLY EXISTS WHILE IT IS MOVING, so it needs catching rather than
   walking to. Ride the window until the square it is going to stop on lights up, then wait
   out the ticker's own fade before shooting: caught inside those few hundred milliseconds
   the headline photographs as an empty line, which is a fright and not a fault. */
async function shotSim(pg, file) {
  for (let i = 0; i < 90; i++) {
    const lit = await pg.$eval('#sim-grid', (e) => !!e.querySelector('.cd.stop')).catch(() => false);
    if (lit) {
      await pg.waitForTimeout(500);
      await pg.screenshot({ path: file });
      return true;
    }
    const up = await pg.$eval('#off-monthcard', (e) => e.classList.contains('running')).catch(() => false);
    if (!up) return false;
    await pg.waitForTimeout(150);
  }
  return false;
}


/* A CUTSCENE CAN TAKE THE SCREEN THE MOMENT A TERM STARTS, and one that a walker does not
   know about is a walker that stalls on the one screen with no dock. Skip it: the scenes have
   their own suite in test_scene, and every other file here is testing something behind them.
   Called after anything that could arrive at the office. */
async function pastScene(pg) {
  for (let i = 0; i < 6; i++) {
    const up = await pg.$eval('#s-scene', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) return;
    await pg.click('#b-scene-skip').catch(() => {});
    await pg.waitForTimeout(320);
  }
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const on = (p, id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
const tap = async (p, s) => { try { await p.click(s, { timeout: 2000 }); return true; } catch (e) { return false; } };

async function run(width, suffix) {
  const p = await b.newPage({ viewport: { width, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(arm + stub);
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2600);
  await tap(p, '#g-start'); await p.waitForTimeout(700);
  await pastScene(p);
  await p.screenshot({ path: OUT + 'ui_office' + suffix + '.png', fullPage: true });

  /* The first window of the term, caught on the day it stops. */
  await tap(p, '#b-desk');
  await shotSim(p, OUT + 'ui_sim' + suffix + '.png');
  await skipSim(p); await p.waitForTimeout(400);

  /* Walk to a desk that has dials on it, so the shot shows the settings too. */
  let shot = false;
  for (let i = 0; i < 16 && !shot; i++) {
    if (await on(p, 's-office')) { await tap(p, '#b-desk'); await skipSim(p); await p.waitForTimeout(400); continue; }
    if (await on(p, 's-room')) { await tap(p, '#b-next'); await p.waitForTimeout(500); continue; }
    if (await on(p, 's-year')) { await tap(p, '#b-year-next'); await p.waitForTimeout(500); continue; }
    if (!(await on(p, 's-desk'))) break;
    const opt = await p.$('#d-options .opt');
    if (opt) { await opt.click(); await p.waitForTimeout(350); }
    if ((await p.$$('.steps button')).length) {
      await p.screenshot({ path: OUT + 'ui_desk' + suffix + '.png', fullPage: true });
      shot = true;
      await tap(p, '#b-rule'); await p.waitForTimeout(700);
      await pastScene(p);
      await p.screenshot({ path: OUT + 'ui_room' + suffix + '.png', fullPage: true });
      break;
    }
    await tap(p, '#b-rule'); await p.waitForTimeout(500);
    await pastScene(p);
    if (await on(p, 's-room')) { await p.screenshot({ path: OUT + 'ui_room' + suffix + '.png', fullPage: true }); }
  }

  /* On to the year in review. */
  for (let i = 0; i < 40; i++) {
    if (await on(p, 's-year')) break;
    if (await on(p, 's-office')) { await tap(p, '#b-desk'); await skipSim(p); await p.waitForTimeout(350); continue; }
    if (await on(p, 's-desk')) {
      const o = await p.$('#d-options .opt'); if (o) { await o.click(); await p.waitForTimeout(200); }
      if (!(await tap(p, '#b-rule'))) break;
      await p.waitForTimeout(400); continue;
    }
    if (await on(p, 's-room')) { await tap(p, '#b-next'); await p.waitForTimeout(400); continue; }
    break;
  }
  if (await on(p, 's-year')) await p.screenshot({ path: OUT + 'ui_year' + suffix + '.png', fullPage: true });
  console.log(width + 'px:', errs.length ? errs : 'no page errors');
  await p.close();
}

await run(390, '');
await run(430, '_430');
await b.close();
console.log('shots in ' + OUT);
