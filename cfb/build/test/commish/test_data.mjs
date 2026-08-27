/* THE DATA CENTER, IN A BROWSER.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_data.mjs
 *
 * test_metrics.mjs checks the arithmetic with no browser in the room. What it cannot check
 * is whether the page draws what the arithmetic returned, and a chart is the one screen in
 * this mode that can be wrong in a way that still looks like a chart. Three things here:
 *
 *   IT IS FED       the tape has to actually be written as a term is played. Nothing else
 *                   on the screen fails if record() is never called: the chart simply says
 *                   there is nothing to draw, forever, and reads as a feature nobody
 *                   finished rather than as a bug.
 *
 *   IT IS HONEST    one axis. Switching series must not leave the old scale behind, the
 *                   crosshair must read the value the line is drawn at, and the table under
 *                   the chart has to agree with the chart.
 *
 *   IT IS REACHABLE the value under the pointer is also reachable without a pointer.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../../../..');
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

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(arm + stub);
await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(2400);
await p.click('#g-start').catch(() => {});
await p.waitForTimeout(900);

const on = (id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
const tap = async (s) => { try { await p.click(s, { timeout: 2000 }); return true; } catch (e) { return false; } };
async function skipSim() {
  for (let i = 0; i < 60; i++) {
    const up = await p.$eval('#s-sim', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) return;
    await p.click('#s-sim', { timeout: 1500 }).catch(() => {});
    await p.waitForTimeout(110);
  }
}

console.log('\n=== the tape gets written as a term is played ===');
{
  /* A CHART OF NOTHING IS THE FAILURE MODE THAT LOOKS LIKE A DESIGN DECISION. If record()
     is never wired to the beats, every other assertion in this file still passes against
     an empty screen that says "nothing recorded yet" and means it forever. */
  const rows = () => p.evaluate(() => (window.__w && window.__w.tape ? window.__w.tape.length : -1));
  await p.evaluate(() => { try { window.__w = JSON.parse(localStorage.getItem('cfb_commish_term')).world; } catch (e) { window.__w = null; } });
  const start = await rows();
  ok('the tape exists from the first beat', start >= 1, start + ' rows');

  /* WALK UNTIL THERE IS A TAPE WORTH CHARTING AND WE ARE STANDING IN THE OFFICE, which is
     the only screen the data centre opens from. Two things make that harder than a fixed
     number of steps:

       BEING VOTED OUT IS A LEGITIMATE OUTCOME of taking the first option forty times, and
       it can happen after three rulings. Stopping there leaves the walk on an ending, and
       every assertion below then fails against a screen with no chart on it because there
       is no chart on an ending.

       A YEAR IN REVIEW AND AN ENDING ARE THE SAME SCREEN, told apart only by the button's
       own text. Pressing through an ending starts a FRESH term, which is correct behaviour
       and resets the tape, so a run that did it reported "1 to 3 rows" and read as a
       recorder that had stopped working.

     So: an ending is not a stop, it is a new term, and the loop keeps going until the tape
     in whatever term it is now in is long enough to draw. Measured against the tape itself
     rather than against a step count, so it cannot silently come up short again. */
  const WANT = 10;
  const tapeNow = () => p.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('cfb_commish_term')).world.tape.length; }
    catch (e) { return 0; }
  });
  let ruled = 0, terms = 1, ready = false;
  for (let i = 0; i < 110 && !ready; i++) {
    if (await on('s-office')) {
      if (await tapeNow() >= WANT) { ready = true; break; }
      await tap('#b-desk'); await skipSim(); await p.waitForTimeout(300); continue;
    }
    if (await on('s-desk')) {
      const o = await p.$('#d-options .opt');
      if (o) { await o.click(); await p.waitForTimeout(160); }
      if (await tap('#b-rule')) ruled++;
      await p.waitForTimeout(400); continue;
    }
    if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(360); continue; }
    if (await on('s-year')) {
      const t = await p.$eval('#b-year-next', (e) => e.textContent).catch(() => '');
      if (/take the job again/i.test(t)) { terms++; ruled = 0; }
      await tap('#b-year-next'); await p.waitForTimeout(400); continue;
    }
    break;
  }
  await p.evaluate(() => { try { window.__w = JSON.parse(localStorage.getItem('cfb_commish_term')).world; } catch (e) { window.__w = null; } });
  const after = await rows();
  ok('  and grows as the term is played', ready && after >= WANT,
    start + ' to ' + after + ' rows' + (terms > 1 ? ', over ' + terms + ' terms' : ''));
  /* ONE ROW PER POSITION. The recorder runs on every office paint and after every ruling,
     and both of those can fire twice; a tape with duplicates draws flat segments that were
     never flat and reports a term as calmer than it was. */
  const dupes = await p.evaluate(() => {
    const seen = {}; let d = 0;
    (window.__w.tape || []).forEach((r) => {
      const k = r.y + '|' + r.b + '|' + r.n;
      if (seen[k]) d++; seen[k] = 1;
    });
    return d;
  });
  ok('  with no position recorded twice', dupes === 0, dupes + ' duplicates');
  ok('  and a point for each ruling', ruled > 0, ruled + ' rulings made');
  /* It rides in the save file, so it has to stay small enough to keep riding there. */
  const kb = await p.evaluate(() => Math.round((localStorage.getItem('cfb_commish_term') || '').length / 1024));
  ok('  and the save file is still small', kb < 220, kb + 'KB');
}

console.log('\n=== the chart draws ===');
await tap('#b-data');
await p.waitForTimeout(600);
{
  ok('the data center opens', await on('s-data'));
  const svg = await p.$('#dc-plot svg');
  ok('  with a chart in it', !!svg);
  const pathLen = await p.$eval('#dc-plot .dcline', (e) => e.getAttribute('d').length).catch(() => 0);
  ok('  and a line with more than one point in it', pathLen > 30, pathLen + ' chars of path');

  /* THE PLOT MUST FIT ITS OWN AXIS. A container sized to the plot alone clips the x labels
     and the card grows a tiny nested scrollbar. */
  const fit = await p.evaluate(() => {
    const s = document.querySelector('#dc-plot svg');
    const vb = s.getAttribute('viewBox').split(' ').map(Number);
    const ys = [].slice.call(s.querySelectorAll('.dcxt')).map((t) => +t.getAttribute('y'));
    return { h: vb[3], maxY: ys.length ? Math.max.apply(null, ys) : 0, n: ys.length };
  });
  ok('  the x-axis labels are inside the viewBox', fit.n > 0 && fit.maxY < fit.h,
    fit.n + ' labels, lowest at ' + fit.maxY + ' of ' + fit.h);
  ok('  and the card does not scroll sideways', await p.evaluate(() => {
    const c = document.querySelector('.dccard');
    return c.scrollWidth <= c.clientWidth + 1;
  }));

  /* GRIDLINES ARE SOLID HAIRLINES. Dashing reads as a projection or a threshold when it is
     neither, and at this density it is only noise. */
  ok('  the grid is solid, not dashed', await p.evaluate(() => {
    return [].slice.call(document.querySelectorAll('#dc-plot .dcgrid'))
      .every((l) => { const d = getComputedStyle(l).strokeDasharray; return !d || d === 'none'; });
  }));
}

console.log('\n=== one axis, and it changes with the series ===');
{
  /* THE THING THAT WOULD MAKE EVERY CHART HERE A LIE: a scale left over from the last
     series. Switching from a meter out of 100 to a pool in billions has to move the axis,
     or the pool is drawn against 0-100 and reads as a flat line on the floor. */
  const axis = () => p.$$eval('#dc-plot .dcyt', (e) => e.map((t) => t.textContent));
  await p.click('#dc-pick button[data-s="standing"]').catch(() => {});
  await p.waitForTimeout(400);
  const a1 = await axis();
  await p.click('#dc-pick button[data-s="pool"]').catch(() => {});
  await p.waitForTimeout(400);
  const a2 = await axis();
  ok('the axis is redrawn for a series on another scale',
    a1.join() !== a2.join(), a1.join(' ') + '   became   ' + a2.join(' '));
  ok('  and reads in that series own units', a2.some((t) => /^\$/.test(t)), a2.join(' '));

  /* And there is only ever ONE of them. Two y-scales on one plot is the single worst thing
     a chart can do, and the guard is that the page has no second axis to draw with. */
  const axes = await p.$$eval('#dc-plot text', (e) => e.filter((t) => t.classList.contains('dcyt')).length);
  const rightSide = await p.evaluate(() => [].slice.call(document.querySelectorAll('#dc-plot .dcyt'))
    .every((t) => t.getAttribute('text-anchor') === 'end' && +t.getAttribute('x') < 60));
  ok('  and every tick label is on the same side', rightSide, axes + ' ticks, all on the left');
}

console.log('\n=== the crosshair reads the line ===');
{
  await p.click('#dc-pick button[data-s="standing"]').catch(() => {});
  await p.waitForTimeout(400);
  /* CLICKING A CHIP SCROLLS THE PAGE, because the picker sits below the chart, and the
     chart can end up above the top of the viewport. A pointer aimed at its rectangle then
     lands on nothing and every assertion below reports a crosshair that does not work when
     what does not work is the test. */
  await p.evaluate(() => document.querySelector('.dccard').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(250);
  const box = await p.$eval('#dc-plot svg', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  ok('the plot is on screen to be hovered', box.y > 0 && box.h > 40,
    'y ' + Math.round(box.y) + ', h ' + Math.round(box.h));
  await p.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.5);
  await p.waitForTimeout(220);
  const tip = await p.evaluate(() => {
    const t = document.querySelector('#dc-plot .dctip');
    const c = document.querySelector('#dc-plot .dccross');
    return { hidden: t.hidden, text: t.textContent, cross: !c.hidden,
      value: (t.querySelector('em') || {}).textContent || '' };
  });
  ok('hovering the plot shows a readout', !tip.hidden && tip.cross, JSON.stringify(tip.value));
  ok('  that names when in the term it is', /\d{4}/.test(tip.text), tip.text.slice(0, 40));
  /* THE NUMBER IN THE TOOLTIP IS THE NUMBER ON THE TAPE. A tooltip reading a different
     series, or an off-by-one index, is invisible and wrong. */
  const agrees = await p.evaluate(() => {
    const M = window.PS_CFB_METRICS;
    const w = JSON.parse(localStorage.getItem('cfb_commish_term')).world;
    const pts = M.points(w, 'standing', 'term');
    const shown = document.querySelector('#dc-plot .dctip em').textContent;
    return pts.some((q) => M.fmt(q.v, M.BY_ID.standing) === shown);
  });
  ok('  and the number it shows is a number on the tape', agrees);

  /* THE POINTER IS NEVER ASKED TO LAND ON THE LINE. Anywhere in the plot at any height
     resolves to the nearest moment in x. */
  await p.mouse.move(box.x + box.w * 0.2, box.y + 4);
  await p.waitForTimeout(180);
  const top = await p.$eval('#dc-plot .dctip', (e) => e.hidden);
  await p.mouse.move(box.x + box.w * 0.8, box.y + box.h - 4);
  await p.waitForTimeout(180);
  const bottom = await p.$eval('#dc-plot .dctip', (e) => e.hidden);
  ok('  and it reads at the top of the plot as well as the bottom', !top && !bottom);

  /* KEYBOARD GETS THE SAME READOUT. A value only a pointer can reach is a value some
     readers never get. */
  await p.mouse.move(box.x - 60, box.y - 60);
  await p.waitForTimeout(150);
  await p.$eval('#dc-plot svg', (e) => e.focus());
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(200);
  const kb = await p.evaluate(() => {
    const t = document.querySelector('#dc-plot .dctip');
    return { hidden: t.hidden, v: (t.querySelector('em') || {}).textContent || '' };
  });
  ok('arrow keys read the same series', !kb.hidden && kb.v.length > 0, kb.v);
}

console.log('\n=== comparing does not grow a second axis ===');
{
  await p.click('#dc-mode button[data-m="cmp"]').catch(() => {});
  await p.waitForTimeout(500);
  const cmp = await p.evaluate(() => ({
    lines: document.querySelectorAll('#dc-plot .dcline').length,
    legend: document.querySelectorAll('.dclegend span').length,
    labels: [].slice.call(document.querySelectorAll('#dc-plot .dcdl'))
      .map((t) => ({ y: +t.getAttribute('y'), t: t.textContent })),
    picker: document.getElementById('dc-pickcard').hidden,
    ticks: [].slice.call(document.querySelectorAll('#dc-plot .dcyt')).map((t) => t.textContent),
  }));
  ok('three lines are drawn', cmp.lines === 3, cmp.lines + ' lines');
  /* A LEGEND IS ALWAYS PRESENT FOR MORE THAN ONE SERIES, and four or fewer are also direct
     labeled, so identity is never carried by color alone. */
  ok('  with a legend naming all three', cmp.legend === 3, cmp.legend + ' entries');
  ok('  and each line labeled at its own end', cmp.labels.length === 3,
    JSON.stringify(cmp.labels.map((l) => l.t)));
  /* THE SMUDGE. Two lines finishing a point apart put their labels at the same height. */
  const ys = cmp.labels.map((l) => l.y).sort((a, c) => a - c);
  ok('  none of them on top of another',
    ys.every((y, i) => i === 0 || y - ys[i - 1] >= 10), JSON.stringify(ys));
  ok('  and nothing to pick, because the three are fixed', cmp.picker === true);
  ok('  everything indexed against one scale', cmp.ticks.length > 1, cmp.ticks.join(' '));

  const back = await p.evaluate(() => {
    const M = window.PS_CFB_METRICS;
    const w = JSON.parse(localStorage.getItem('cfb_commish_term')).world;
    return M.COMPARE.map((id) => {
      const pts = M.indexed(M.points(w, id, 'term'));
      return pts ? Math.round(pts[0].v) : null;
    });
  });
  ok('  and every line starting at exactly 100', back.every((v) => v === 100 || v === null),
    JSON.stringify(back));
}

console.log('\n=== the room is nine charts, not nine lines on one ===');
{
  const room = await p.evaluate(() => ({
    cells: document.querySelectorAll('#dc-room .dccell').length,
    sparks: document.querySelectorAll('#dc-room .dcspark').length,
    named: [].slice.call(document.querySelectorAll('#dc-room .dcname'))
      .every((n) => n.textContent.trim().length > 1),
  }));
  /* NINE LINES ON ONE PLOT IS THE ANTI-PATTERN AND THE VALIDATOR SAYS SO: the nine bloc
     colors this mode already uses come back at a color-blind separation of 3.7 for the
     closest pair, which is the same color. Nine little charts, each alone in its frame
     with its name beside it, has no adjacency problem at all. */
  ok('nine cells', room.cells === 9, room.cells + ' cells');
  ok('  each with its own plot', room.sparks >= 8, room.sparks + ' sparklines');
  ok('  and its own name, so the color is never the only label', room.named);

  await p.click('#dc-room .dccell:nth-child(3)').catch(() => {});
  await p.waitForTimeout(450);
  const title = await p.$eval('.dctitle b', (e) => e.textContent);
  ok('tapping one opens it in the big chart', title === 'ACC', title);
}

console.log('\n=== the table says the same thing as the chart ===');
{
  /* THE TWIN. Every value the chart draws, with no pointer, no hover and no color. A
     tooltip that is the only route to a number is a number some readers simply do not get. */
  await p.click('#b-dctable');
  await p.waitForTimeout(400);
  const tab = await p.evaluate(() => {
    const M = window.PS_CFB_METRICS;
    const rows = [].slice.call(document.querySelectorAll('#dc-table tbody tr'));
    const w = JSON.parse(localStorage.getItem('cfb_commish_term')).world;
    const pts = M.points(w, 'bloc:ACC', 'term');
    return {
      shown: !document.getElementById('dc-table').hidden,
      rows: rows.length, points: pts.length,
      first: rows.length ? rows[0].querySelector('td').textContent : '',
      want: pts.length ? M.fmt(pts[0].v, M.BY_ID['bloc:ACC']) : '',
      headers: [].slice.call(document.querySelectorAll('#dc-table th[scope=col]')).length,
    };
  });
  ok('the table opens', tab.shown);
  ok('  with a row for every point on the chart', tab.rows === tab.points,
    tab.rows + ' rows for ' + tab.points + ' points');
  ok('  and the same numbers in it', tab.first === tab.want, tab.first + ' vs ' + tab.want);
  ok('  with real column headers, so it is a table and not a grid of divs',
    tab.headers >= 2, tab.headers + ' headers');
}

console.log('\n=== a series with nothing behind it says so ===');
{
  /* A SEASON THAT HAS NOT BEEN PLAYED HAS NO VIEWERSHIP, and drawing that as a flat line
     on the floor of the chart is a collapse that did not happen. "No data" is also wrong,
     because it reads as broken. */
  await p.click('#dc-mode button[data-m="one"]').catch(() => {});
  await p.waitForTimeout(300);
  await p.click('#dc-pick button[data-s="perGame"]').catch(() => {});
  await p.waitForTimeout(400);
  const empty = await p.evaluate(() => {
    const n = document.querySelector('#dc-plot .dcnone');
    return { none: !!n, text: n ? n.textContent.trim() : '',
      lines: document.querySelectorAll('#dc-plot .dcline').length };
  });
  if (empty.none) {
    ok('an unplayed series explains itself rather than drawing a floor', empty.lines === 0,
      empty.text.slice(0, 70));
    ok('  in a sentence, not the words "no data"', !/no data/i.test(empty.text) && empty.text.length > 20);
  } else {
    ok('this term has played a season, so viewership draws instead', empty.lines > 0,
      empty.lines + ' lines');
  }
}

console.log('\n=== back out, and the term is untouched ===');
{
  /* THE DATA CENTER IS A READING ROOM. It must not advance a beat, rule on anything, or
     write to the world beyond the tape it was already writing. */
  const before = await p.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('cfb_commish_term')).world;
    return { y: w.year, b: w.beat, n: w.history.length };
  });
  await p.click('#b-dcback');
  await p.waitForTimeout(500);
  ok('it goes back to the office', await on('s-office'));
  const after = await p.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('cfb_commish_term')).world;
    return { y: w.year, b: w.beat, n: w.history.length };
  });
  ok('  having changed nothing about the term',
    JSON.stringify(before) === JSON.stringify(after),
    JSON.stringify(before) + ' vs ' + JSON.stringify(after));
}

ok('no page errors', !errs.length, errs.join(' | ') || 'none');

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
