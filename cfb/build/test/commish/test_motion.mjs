/* NOTHING ON THESE SCREENS IS CARRIED BY MOTION ALONE.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_motion.mjs
 *
 * The mode grew a motion layer: screens arrive with a direction, lists deal out in order,
 * bars grow from nothing and the meter numbers count up to where they landed. Every one of
 * those is a state the page passes THROUGH, and each of them has the same failure mode: it
 * gets stuck there. A bar that never receives its real width is a bar at zero. A number that
 * counts from the old value and never finishes is the old value. Neither throws, neither
 * looks like a bug in a screenshot taken a second later, and both are wrong on the screen
 * the player is actually reading.
 *
 * It is worse for somebody who has asked their operating system to stop moving things. That
 * path skips the animation entirely, which means it skips the code that would have arrived
 * at the final state, so if the final state is only ever reached BY animating, reduced
 * motion is a page with every bar empty. That reader gets no hint that anything is missing.
 *
 * So this runs the same term twice, once with motion and once with prefers-reduced-motion,
 * and asserts the page ends up in the same place both times.
 */
import { chromium } from 'playwright';
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

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const on = (p, id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
const tap = async (p, s) => { try { await p.click(s, { timeout: 2000 }); return true; } catch (e) { return false; } };

/* Every bar that the page grows, as the width it actually settled at. A bar left at zero is
   indistinguishable in the DOM from a bar the world says is zero, so the check is that SOME
   of them are non-zero, per block, which is what a stuck grow() breaks. */
const widths = (p) => p.$$eval('[data-w]', (els) => els.map((e) => ({
  want: e.getAttribute('data-w'), got: e.style.width,
})));

async function walk(reduced) {
  const p = await b.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(arm + stub);
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2400);
  await tap(p, '#g-start');
  await p.waitForTimeout(1400);

  const office = {
    bars: await widths(p),
    meters: await p.$$eval('#off-meters .n', (e) => e.map((x) => x.textContent)),
    calCells: await p.$$eval('#off-cal .cel', (e) => e.length),
    calNow: await p.$$eval('#off-cal .cel.now', (e) => e.length),
    states: await p.$$eval('#off-map .st', (e) => e.length),
    dots: await p.$$eval('#off-map .dot', (e) => e.length),
  };

  /* THE LEGEND IS A FILTER AND IT REPAINTS THE MAP, which is the one place a repaint could
     quietly eat something: it runs the same function that draws the country in and marks
     what moved. Tap a conference, tap it again, and the map has to come back exactly as it
     was, with the same number of dots and nothing left dimmed. */
  const legend = await p.$$('#off-map .maplegend [data-c]');
  if (legend.length) {
    const name = await legend[0].getAttribute('data-c');
    await legend[0].click();
    await p.waitForTimeout(250);
    office.focusOn = await p.$eval('#off-map', (e) => e.classList.contains('focus'));
    office.lit = await p.$$eval('#off-map .dot.fc', (e) => e.length);
    office.forConf = await p.$$eval('#off-map .dot', (e, n) =>
      e.filter((d) => d.getAttribute('data-c') === n).length, name);
    /* Same element, found again: the repaint replaced the node the handle pointed at. */
    const again = await p.$('#off-map .maplegend [data-c]');
    await again.click();
    await p.waitForTimeout(250);
    office.focusOff = await p.$eval('#off-map', (e) => e.classList.contains('focus'));
    office.dotsAfter = await p.$$eval('#off-map .dot', (e) => e.length);
    office.drewAgain = await p.$eval('#off-map', (e) => e.classList.contains('drawin'));
  }

  /* On to a ruling, which is the screen where the numbers count and the move bars grow. */
  let ruled = false;
  for (let i = 0; i < 24 && !ruled; i++) {
    if (await on(p, 's-office')) { await tap(p, '#b-desk'); await skipSim(p); await p.waitForTimeout(350); continue; }
    if (await on(p, 's-desk')) {
      const o = await p.$('#d-options .opt'); if (o) { await o.click(); await p.waitForTimeout(200); }
      if (!(await tap(p, '#b-rule'))) break;
      await p.waitForTimeout(1500);
      ruled = await on(p, 's-room');
      continue;
    }
    break;
  }
  const room = ruled ? {
    bars: await widths(p),
    meters: await p.$$eval('#r-meters .n', (e) => e.map((x) => x.textContent)),
    rows: await p.$$eval('#r-room .bl', (e) => e.length),
  } : null;
  await p.close();
  return { office, room, errs };
}

console.log('\n=== with motion ===');
const a = await walk(false);
{
  ok('no page errors', !a.errs.length, a.errs.join(' | ') || 'none');
  ok('every bar reached the width it was given',
    a.office.bars.length > 0 && a.office.bars.every((x) => x.got === x.want),
    a.office.bars.length + ' bars');
  ok('  and the office is not a row of empty tracks',
    a.office.bars.some((x) => parseFloat(x.got) > 0),
    a.office.bars.filter((x) => parseFloat(x.got) > 0).length + ' non-zero');
  ok('the three meters show a number', a.office.meters.length === 3
    && a.office.meters.every((m) => /^\d+$/.test(m)), a.office.meters.join(' '));
  /* ONE YEAR, NINE BEATS. The strip stopped being five years across when it became a thing
     you read rather than a thing you counted: five rows of nine cells said less about where
     you are than one row does. */
  ok('the calendar is one year of beats', a.office.calCells === 9, a.office.calCells + ' cells');
  ok('  with exactly one beat marked as now', a.office.calNow === 1);
  ok('the country is under the dots', a.office.states >= 48, a.office.states + ' states');
  ok('tapping a conference in the legend singles it out', a.office.focusOn === true);
  ok('  and lights exactly that conference',
    a.office.lit > 0 && a.office.lit === a.office.forConf,
    a.office.lit + ' of ' + a.office.dots + ' dots');
  ok('  tapping it again puts everybody back', a.office.focusOff === false);
  ok('  with the map intact', a.office.dotsAfter === a.office.dots,
    a.office.dotsAfter + ' dots');
  /* A FILTER IS NOT A NEW YEAR. The draw-in belongs to a season arriving, and spending it on
     a legend tap would both waste the moment and read as the clock moving. */
  ok('  and without redrawing the country', a.office.drewAgain === false);
  ok('a ruling reaches the room', !!a.room);
  if (a.room) {
    /* THE COUNT HAS TO LAND. It runs from the value one ruling ago to the value now, and a
       number frozen mid-count is a number that is simply wrong. */
    ok('  the meters finished counting', a.room.meters.every((m) => /^\d+$/.test(m)),
      a.room.meters.join(' '));
    ok('  every reaction bar reached its width', a.room.bars.every((x) => x.got === x.want),
      a.room.bars.length + ' bars');
    ok('  and the whole room answered', a.room.rows === 9, a.room.rows + ' rows');
  }
}

console.log('\n=== with prefers-reduced-motion ===');
const r = await walk(true);
{
  ok('no page errors', !r.errs.length, r.errs.join(' | ') || 'none');
  /* THE POINT OF THE WHOLE FILE. Reduced motion takes the branch that never animates, so if
     any final state is only ever reached by animating, this is where it shows up empty. */
  ok('every bar is at its real width without animating',
    r.office.bars.length > 0 && r.office.bars.every((x) => x.got === x.want),
    r.office.bars.filter((x) => x.got !== x.want).length + ' short of it');
  ok('the meters read the same as they do with motion',
    JSON.stringify(r.office.meters) === JSON.stringify(a.office.meters),
    r.office.meters.join(' '));
  ok('the calendar is the same calendar',
    r.office.calCells === a.office.calCells && r.office.calNow === a.office.calNow);
  ok('the map is the same map', r.office.states === a.office.states);
  ok('a ruling still reaches the room', !!r.room);
  if (r.room) {
    ok('  with its numbers written rather than counted',
      r.room.meters.every((m) => /^\d+$/.test(m)), r.room.meters.join(' '));
    ok('  and every reaction bar at its width',
      r.room.bars.every((x) => x.got === x.want), r.room.bars.length + ' bars');
  }
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
