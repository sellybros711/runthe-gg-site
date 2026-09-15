/* The two on-course decision markers, measured on every decision the game can ask.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/verify-decision-targets.mjs
 *
 * The old display drew each option as an ellipse whose WIDTH was its dispersion: the risky one 35 to 71
 * pixels across, the safe one 14 to 23. Two aim points on one green are inherently close together, so the
 * small ring sat INSIDE the big one and the labels were shoved apart sideways to stay legible, which cut
 * each label loose from the thing it named. That is what the owner saw: "most of the time aren't accurate
 * or clash in some way."
 *
 * It was not occasional. This file is what proved it and it still measures the old rule alongside the new
 * one, from the same geometry, so the columns are the same decisions:
 *
 *   rings overlapping, old: 983 of 1008
 *
 * Every decision here is GENERATED, not stated: the real dScenario() for every hole of every daily
 * course, the real hvGeom(), the real dDecTargets(), and the same arithmetic dPlaceTargets does to turn a
 * course point into a position in the window. The elements are then RENDERED and measured with
 * getBoundingClientRect, because a marker and a label that do not overlap in theory can still overlap on
 * screen once the label has a font and a padding.
 *
 * The instrumented copy is written into golf/ and removed in a finally. If a crash leaves one behind it is
 * called __test_dectgt.html and is safe to delete.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_dectgt.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 230) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__DT = {
  /* every decision on the site, without rendering: geometry, scenario, the two aim points, and the same
     percent positions dPlaceTargets computes from them */
  sweep(){
    var out=[], keys=Object.keys(DAILY_COURSES);
    S.daily=true; S.h2h=null; S.dailySkills={};
    CATS.forEach(function(c){ S.dailySkills[c.k]=80; });
    for(var ci=0; ci<keys.length; ci++){
      var ck=keys[ci], holes=(DAILY_COURSES[ck]||{}).holes||[];
      for(var h=0; h<holes.length; h++){
        S.dailySeed=20260101; S.dailyCourse=ck;
        var seedN=(dHash(ck||'x')^Math.imul((h|0)+1,0x9e3779b1))>>>0;
        var g; try{ g=hvGeom(seedN, holes[h][0], holes[h][1]||400, ck, h); }catch(e){ continue; }
        if(!g||!g.greenR) continue;
        var sc; try{ sc=dScenario(ck,h,0,71); }catch(e){ continue; }
        var tg; try{ tg=dDecTargets(g,sc); }catch(e){ continue; }
        var P=function(pt){ var p=hvProj(g,pt[0],pt[1]);
          return {lf:Math.max(4,Math.min(96,(p[0]+HV_EXL)/(HV_W+2*HV_EXL)*100)),
                  tp:Math.max(3,Math.min(97,p[1]/HV_H*100))}; };
        // the OLD rule, recomputed from the same geometry: sized by dispersion, placed with no gap rule
        var od=dDecOdds(sc,S.dailySkills), sq=dSkQ(od.val);
        var oldA=Math.round(30+od.aggRisk*1.15), oldS=Math.round(14+(1-sq)*9);
        var pa=P(tg.agg), ps=P(tg.safe);
        var oldDx=Math.abs(pa.lf-ps.lf)/100*HV_W, oldDy=Math.abs(pa.tp-ps.tp)/100*HV_H;
        out.push({course:ck, hole:h, par:holes[h][0], phase:sc.phase,
          al:tg.al, sl:tg.sl, leave:sc.leave||null,
          aggY:+tg.agg[1].toFixed(1), safeY:+tg.safe[1].toFixed(1), L:+g.L.toFixed(1),
          oldOverlap:(oldDx<(oldA+oldS)/2 && oldDy<(oldA*0.53+oldS*0.53)/2),
          aggLab:(sc.opts&&sc.opts[0]?sc.opts[0].l:''), safeLab:(sc.opts&&sc.opts[1]?sc.opts[1].l:'')});
      }
    }
    return out;
  },
  /* RENDER one decision on the real tracer and measure what actually landed on screen. Async on purpose:
     the label de-collision runs in a requestAnimationFrame, so measuring synchronously measures the frame
     BEFORE the fix and reports 285 labels sitting under the hole chip that are not. */
  async render(ck, h){
    S.daily=true; S.dailySeed=20260101; S.dailyCourse=ck; S.dailySkills={};
    CATS.forEach(function(c){ S.dailySkills[c.k]=80; });
    var holes=(DAILY_COURSES[ck]||{}).holes||[];
    var sc; try{ sc=dScenario(ck,h,0,71); }catch(e){ return null; }
    var hole={n:h+1, par:holes[h][0], yards:holes[h][1], shots:[]};
    var node=hvNode(hole, null, h, ck, null, null, null);
    var host=document.getElementById('dthost'); host.innerHTML=''; host.appendChild(node);
    var shell=node.querySelector('.hvshell');
    shell.appendChild($(hvHoleChipHTML(ck, hole, true)));
    var g=hole._hv.g;
    dPlaceTargets(shell, g, sc, function(){}, [g.cx(0), 0]);
    await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
    var rects=function(sel){ return Array.prototype.map.call(shell.querySelectorAll(sel), function(e){
      var r=e.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}; }); };
    var over=function(p,q){ return !(p.r<=q.l||q.r<=p.l||p.b<=q.t||q.b<=p.t); };
    var mk=rects('.dctarget .dtr'), lb=rects('.dctarget .dtw'), lines=shell.querySelectorAll('svg.dclines').length;
    var chip=shell.querySelector('.hvhole'), cr=chip?chip.getBoundingClientRect():null;
    return {markers:mk.length, labels:lb.length, lines:lines,
      markerOverlap:(mk.length===2 && over(mk[0],mk[1])),
      labelOverlap:(lb.length===2 && over(lb[0],lb[1])),
      sameSize:(mk.length===2 && Math.abs(mk[0].w-mk[1].w)<1.5 && Math.abs(mk[0].h-mk[1].h)<1.5),
      labelOverChip:(cr!=null && lb.some(function(r){ return over(r,{l:cr.left,t:cr.top,r:cr.right,b:cr.bottom}); })),
      gap:(mk.length===2?+Math.hypot((mk[0].l+mk[0].r)/2-(mk[1].l+mk[1].r)/2,(mk[0].t+mk[0].b)/2-(mk[1].t+mk[1].b)/2).toFixed(1):null),
      nums:Array.prototype.map.call(shell.querySelectorAll('.dctarget .dtr i'), function(e){ return e.textContent; })};
  },
  /* the numbers on the CARDS, which have to match the numbers on the course */
  cardNums(ck,h){
    var sc=dScenario(ck,h,0,71);
    var p=dDecisionPanel(sc, function(){}, null, h);
    return Array.prototype.map.call(p.querySelectorAll('.dkc .l .dcn'), function(e){ return e.textContent; });
  }
};
(function(){ var d=document.createElement('div'); d.id='dthost';
  d.style.cssText='width:900px'; document.body.appendChild(d); })();
`;

function buildProbe() {
  const src = fs.readFileSync(SRC, 'utf8');
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = null;
  while ((m = re.exec(src))) { if (!best || m[1].length > best[1].length) best = m; }
  if (!best) throw new Error('no inline script found in golf/index.html');
  const at = best.index + best[0].length - '</script>'.length;
  fs.writeFileSync(PROBE, src.slice(0, at) + '\n' + HOOK + '\n' + src.slice(at));
}

const pct = (n, d) => (100 * n / d).toFixed(1) + '%';

const run = async () => {
  buildProbe();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(HOST + '/golf/__test_dectgt.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__DT', null, { timeout: 20000 });
  await page.evaluate(() => { const a = document.querySelector('#app'); if (a) a.style.display = 'none'; });

  const rows = await page.evaluate(() => window.__DT.sweep());

  head('the sample');
  console.log(`    every hole of every daily course, with the scenario the game would really ask: ${rows.length} decisions`);
  ok('every one produced two aim points', rows.length > 900, rows.length);

  head('what the old display did, from the same geometry');
  const oldOv = rows.filter(r => r.oldOverlap).length;
  console.log(`    rings that physically overlapped: ${oldOv} of ${rows.length}  (${pct(oldOv, rows.length)})`);
  ok('the overlap was the normal state, not bad luck', oldOv / rows.length > 0.9, pct(oldOv, rows.length));

  head('the markers land where the cards say');
  const withLeave = rows.filter(r => r.leave);
  console.log(`    decisions whose own copy names a yardage: ${withLeave.length}`);
  ok('there are some', withLeave.length > 0, withLeave.length);
  const placed = withLeave.filter(r => {
    const wantA = r.leave.agg === 0 ? r.L : r.L - r.leave.agg;
    const wantS = r.L - r.leave.safe;
    return Math.abs(r.aggY - Math.max(6, wantA)) < 0.6 && Math.abs(r.safeY - Math.max(6, wantS)) < 0.6;
  });
  ok('and every one puts its markers at the yardage it quotes', placed.length === withLeave.length,
    withLeave.filter(r => !placed.includes(r)).slice(0, 3)
      .map(r => ({ course: r.course, hole: r.hole, leave: r.leave, aggY: r.aggY, safeY: r.safeY, L: r.L })));
  const lay = withLeave.filter(r => /Chase it|Hold back|Lay back/.test(r.al + r.sl));
  if (lay.length) {
    const ex = lay[0];
    console.log(`    e.g. ${ex.course} h${ex.hole + 1}: "${ex.aggLab}" / "${ex.safeLab}"`);
    console.log(`         markers at ${(ex.L - ex.aggY).toFixed(0)} and ${(ex.L - ex.safeY).toFixed(0)} yards out (was a flat 14 and 34)`);
  }
  ok('a distance decision never draws the safe option FARTHER out than the risky one',
    withLeave.every(r => r.safeY <= r.aggY),
    withLeave.filter(r => r.safeY > r.aggY).slice(0, 2));

  // ── the part that has to be rendered to be believed ────────────────────────
  head('rendered and measured, every decision on the site');
  const seen = {};
  const sample = rows.filter(r => { const k = r.course + '|' + r.hole; if (seen[k]) return false; seen[k] = 1; return true; });
  let mOv = 0, lOv = 0, notSame = 0, noLine = 0, chipHit = 0, minGap = 1e9, bad2 = [];
  for (const r of sample) {
    const m2 = await page.evaluate(a => window.__DT.render(a[0], a[1]), [r.course, r.hole]);
    if (!m2) continue;
    if (m2.markerOverlap) { mOv++; if (bad2.length < 3) bad2.push({ course: r.course, hole: r.hole, kind: 'markers' }); }
    if (m2.labelOverlap) { lOv++; if (bad2.length < 3) bad2.push({ course: r.course, hole: r.hole, kind: 'labels' }); }
    if (!m2.sameSize) notSame++;
    if (m2.lines !== 1) noLine++;
    if (m2.labelOverChip) chipHit++;
    if (m2.gap != null) minGap = Math.min(minGap, m2.gap);
  }
  console.log(`    rendered ${sample.length} of them in a real browser`);
  console.log(`    closest any two markers come, centre to centre: ${minGap.toFixed(1)}px`);
  ok('no two markers overlap, anywhere', mOv === 0, { overlapping: mOv, examples: bad2 });
  ok('no two labels overlap, anywhere', lOv === 0, { overlapping: lOv, examples: bad2 });
  ok('both markers are always the same size, so neither can swallow the other', notSame === 0, notSame);
  ok('the leader lines are drawn on every one', noLine === 0, noLine);
  ok('and no label is left sitting under the hole chip', chipHit === 0, chipHit);

  head('the numbers tie the course to the cards');
  const nums = await page.evaluate(() => window.__DT.render('Augusta National', 0));
  ok('the markers are numbered 1 and 2', nums.nums.join(',') === '1,2', nums.nums);
  const cardNums = await page.evaluate(() => window.__DT.cardNums('Augusta National', 0));
  ok('and the cards carry the same numbers in the same order', cardNums.join(',') === '1,2', cardNums);

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
  await browser.close();
};

try { await run(); } finally { try { fs.unlinkSync(PROBE); } catch (e) {} }
console.log('\n' + (bad ? bad + ' FAILED' : 'all good'));
process.exit(bad ? 1 : 0);
