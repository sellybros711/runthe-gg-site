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
          al:tg.al, sl:tg.sl, leave:sc.leave||null, green:!!tg.green,
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
    /* RENDERED THE WAY drawWindow RENDERS IT, decision camera and all. A green decision frames the
       green, so a suite that measured the full-hole frame would be grading a screen the game no longer
       draws: the markers would look pushed around a 37px green that is really 122px wide. */
    var seedN=(dHash(ck||'x')^Math.imul((h|0)+1,0x9e3779b1))>>>0;
    var drive={k:'tee', d:'drive, fairway', lie:'fw', fromY:holes[h][1], toY:Math.min(150,Math.round(holes[h][1]*0.3))};
    var shots=(holes[h][0]===3)?[]:[drive];
    var hole={n:h+1, par:holes[h][0], yards:holes[h][1], shots:shots};
    var g0=hvGeom(seedN, holes[h][0], holes[h][1], ck, h);
    hole._hv={g:g0, plots:shots.length?hvPlots(g0,shots,seedN):[]};
    var tg0=dDecTargets(g0,sc);
    var pl0=hole._hv.plots, lst=pl0.length?pl0[pl0.length-1]:null;
    var ballPt=(lst&&lst.to)?lst.to:[g0.cx(0),0];
    var decCam=tg0.green?hvGreenCam(g0, (lst&&lst.to)?lst.to:null):null;
    var node=hvNode(hole, null, h, ck, null, null, null, decCam);
    var host=document.getElementById('dthost'); host.innerHTML=''; host.appendChild(node);
    var shell=node.querySelector('.hvshell');
    shell.appendChild($(hvHoleChipHTML(ck, hole, true)));
    var g=hole._hv.g;
    dPlaceTargets(shell, g, sc, function(){}, ballPt);
    shell.appendChild(dDecisionPanel(sc, function(){}, null, h));
    await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
    var rects=function(sel){ return Array.prototype.map.call(shell.querySelectorAll(sel), function(e){
      var r=e.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}; }); };
    var over=function(p,q){ return !(p.r<=q.l||q.r<=p.l||p.b<=q.t||q.b<=p.t); };
    var mk=rects('.dctarget .dtr'), lb=rects('.dctarget .dtw'), lines=shell.querySelectorAll('svg.dclines').length;
    /* Paint order, as computed styles rather than a hit test: the lines carry pointer-events:none, so
       elementFromPoint can never return them and would report the panel on top whatever the z-index said.
       Everything docked on this window is .hvob, and the lines run the full height of the frame, so they
       have to sit UNDER it or they are drawn straight across the YOUR CALL card. */
    var zOf=function(sel){ var e=shell.querySelector(sel); return e?+getComputedStyle(e).zIndex:null; };
    var zLine=zOf('svg.dclines'), zPanel=zOf('.hvob'), zMark=zOf('.dctarget');
    var chip=shell.querySelector('.hvhole'), cr=chip?chip.getBoundingClientRect():null;
    // a label pushed past the window's own edge is a word cut in half, so measure both labels against it
    var sr=shell.getBoundingClientRect();
    var outFrame=lb.filter(function(r){ return r.l<sr.left-0.6 || r.r>sr.right+0.6; }).length;
    /* WHERE THE MARKERS ENDED UP, against the green they are supposed to be on. Two measures, because one
       would be dishonest on its own:
         - IN COURSE YARDS, the green is an ellipse and the test is exact. This is what dDecTargets chose.
         - ON SCREEN, the only thing that can push a marker off the chosen point is the de-collision pass,
           and on a pin-hunt it pushes HORIZONTALLY, so the horizontal offset from the green's centre is
           the whole of the risk. It is read in units of the green's own projected half width, so 1.0 is
           its edge. The vertical is not measured against a projected span on purpose: perspective
           compresses the back of a green, so the front half occupies more than half the drawn depth and a
           normalised number there reads over 1 for a pin that is plainly on the putting surface. What
           matters vertically is that nothing moved it, which is asserted directly. */
    var tg=dDecTargets(g,sc);
    var CAM=decCam||HV_CAML;
    var P=function(pt){ var p=hvProj(g,pt[0],pt[1]);
      return {lf:Math.max(4,Math.min(96,(p[0]-CAM[0])/CAM[2]*100)),
              tp:Math.max(3,Math.min(97,(p[1]-CAM[1])/CAM[3]*100))}; };
    var gc=P([g.gcx,g.L]), gL=P([g.gcx-g.greenR[0],g.L]), gR=P([g.gcx+g.greenR[0],g.L]);
    var hx=Math.abs(gR.lf-gL.lf)/2||1;
    // the green and the ring in real pixels, because whether the pair CAN both sit on it is a pixel question
    var sw=shell.getBoundingClientRect().width||1;
    var greenPx=+(hx*2/100*sw).toFixed(1), ringPx=+(mk.length?mk[0].w:0).toFixed(1);
    // the separation the pair ended up with, against the least that keeps two rings tappable, and against
    // the separation the two chosen aim points already had before anything moved
    /* MEASURED IN TWO DIMENSIONS, because that is what two circles on a green actually need. Measuring
       the horizontal alone was the last thing wrong in the game and it was wrong here too: a back pin
       sits 47px from the middle with only 8 of those pixels horizontal, and a one-axis test calls that
       an overlap and demands a sideways shove that takes the flag's marker off the flag. */
    var sh2=shell.getBoundingClientRect();
    var gapPx=(mk.length===2)?+Math.hypot((mk[0].l+mk[0].r)/2-(mk[1].l+mk[1].r)/2,
                                          (mk[0].t+mk[0].b)/2-(mk[1].t+mk[1].b)/2).toFixed(2):null;
    var needPx=+(ringPx+(tg.green?4:7)).toFixed(2);
    var pA=P(tg.agg), pS=P(tg.safe);
    var natPx=+Math.hypot((pA.lf-pS.lf)/100*sw, (pA.tp-pS.tp)/100*sh2.height).toFixed(2);
    var at=function(el){ return {lf:parseFloat(el.style.left)||0, tp:parseFloat(el.style.top)||0}; };
    var offs=Array.prototype.map.call(shell.querySelectorAll('.dctarget'), function(el){
      return +Math.abs((at(el).lf-gc.lf)/hx).toFixed(3); });
    // and the same thing in pixels, which is what the eye actually judges: how far past the green's edge
    // the ring's CENTRE is, so a ring still overlapping the putting surface can be told from one that is not
    var pastPx=Array.prototype.map.call(shell.querySelectorAll('.dctarget'), function(el){
      return +Math.max(0, Math.abs((at(el).lf-gc.lf)/100*sw) - hx/100*sw).toFixed(2); });
    // the same two points in course yards, where the green really is an ellipse
    var inGreen=[tg.agg,tg.safe].map(function(pt){
      return +Math.hypot((pt[0]-g.gcx)/g.greenR[0],(pt[1]-g.L)/g.greenR[1]).toFixed(3); });
    var pinP=P(tg.agg), safeP=P(tg.safe), ms2=shell.querySelectorAll('.dctarget');
    // THE SAFE ONE IS THE ONE THAT MAY NEVER MOVE. It is captioned the middle of the green, so it is read
    // against the green, and a push is what took it off the putting surface.
    var onMid=(ms2.length===2) && Math.abs(at(ms2[1]).lf-safeP.lf)<0.01 && Math.abs(at(ms2[1]).tp-safeP.tp)<0.01;
    /* The SAFE one may not move on either axis. The aggressive one may, and must be allowed to: a pin at
       the back of the green differs from the middle in DEPTH, so a marker pinned to one axis could only
       ever say "sideways" about it. That is what the outward check above tests instead. */
    var safeHeld=(ms2.length===2) && Math.abs(at(ms2[1]).lf-safeP.lf)<0.01 && Math.abs(at(ms2[1]).tp-safeP.tp)<0.01;
    /* The aggressive one may be pushed, but only straight OUT along the line the two options differ on:
       further from the middle than the flag is, and on the flag's own side of it. That keeps a back pin
       reading as long and a left pin as left, instead of every pin reading as sideways. */
    var outward=true, pushPx=0;
    if(ms2.length===2){
      var a=at(ms2[0]), mid=at(ms2[1]);
      var vx=(pinP.lf-mid.lf)/100*sw, vy=(pinP.tp-mid.tp)/100*sh2.height, vl=Math.hypot(vx,vy);
      var ax=(a.lf-mid.lf)/100*sw, ay=(a.tp-mid.tp)/100*sh2.height, al=Math.hypot(ax,ay);
      pushPx=+(al-vl).toFixed(2);
      if(Math.hypot(a.lf-pinP.lf, a.tp-pinP.tp)<0.01) outward=true;          // never moved at all
      else if(vl<0.5) outward=(al>=vl-0.01);                                 // pin on the middle: any way out
      else { var cosang=(ax*vx+ay*vy)/Math.max(0.001, al*vl);
        outward=(al>=vl-0.5 && cosang>0.985); }                              // same ray, further out
    }
    /* A LINE MUST END ON ITS MARKER. The markers can move after they are placed, so the paths are drawn
       from the settled positions; drawing them at append time is the bug this reads back. */
    var ends=Array.prototype.map.call(shell.querySelectorAll('svg.dclines path'), function(p){
      var d=(p.getAttribute('d')||'').split('L')[1]||''; var n=d.trim().split(/\s+/).map(Number);
      return {lf:n[0], tp:n[1]}; });
    var mAt=Array.prototype.map.call(shell.querySelectorAll('.dctarget'), at);
    var lineMiss=0;
    if(ends.length===2 && mAt.length===2){
      // .ls is the safe option (marker 2) and .la the aggressive one (marker 1), in that document order
      if(Math.hypot(ends[0].lf-mAt[1].lf, ends[0].tp-mAt[1].tp)>0.02) lineMiss++;
      if(Math.hypot(ends[1].lf-mAt[0].lf, ends[1].tp-mAt[0].tp)>0.02) lineMiss++;
    }
    return {markers:mk.length, labels:lb.length, lines:lines,
      green:!!tg.green, offs:offs, inGreen:inGreen, onMid:onMid, safeHeld:safeHeld, outward:outward, pushPx:pushPx,
      safeOff:(ms2.length===2)?+Math.abs((at(ms2[1]).lf-gc.lf)/hx).toFixed(3):null, lineMiss:lineMiss,
      greenPx:greenPx, ringPx:ringPx, gapPx:gapPx, needPx:needPx, natPx:natPx, pastPx:pastPx,
      outFrame:outFrame,
      labs:Array.prototype.map.call(shell.querySelectorAll('.dctarget .dtl'), function(e){ return e.textContent; }),
      aria:Array.prototype.map.call(shell.querySelectorAll('.dctarget'), function(e){ return e.getAttribute('aria-label'); }),
      /* The markers are CIRCLES (border-radius 50%), so they overlap when their centres are closer than
         their diameter, not when their bounding boxes touch. A box test fails two rings sitting neatly
         apart on a diagonal, which is exactly how a back pin sits against the middle of a green. The
         labels below are rectangles and keep the box test. */
      markerOverlap:(mk.length===2 && Math.hypot((mk[0].l+mk[0].r)/2-(mk[1].l+mk[1].r)/2,
                                                 (mk[0].t+mk[0].b)/2-(mk[1].t+mk[1].b)/2) < (mk[0].w+mk[1].w)/2 - 0.5),
      labelOverlap:(lb.length===2 && over(lb[0],lb[1])),
      sameSize:(mk.length===2 && Math.abs(mk[0].w-mk[1].w)<1.5 && Math.abs(mk[0].h-mk[1].h)<1.5),
      labelOverChip:(cr!=null && lb.some(function(r){ return over(r,{l:cr.left,t:cr.top,r:cr.right,b:cr.bottom}); })),
      /* A LABEL STAYS ON ITS MARKER: the ring's centre sits under the label, clear of its rounded ends,
         and the little pointer is on the ring. The old de-collision slid labels by however far it took
         and the pointer went with them, so "Safe" could float over the water a hundred pixels from its ring
         (owner). Measured on screen, because the answer depends on the font the label actually got. */
      detached:Array.prototype.filter.call(shell.querySelectorAll('.dctarget'), function(c){
        var w=c.querySelector('.dtw').getBoundingClientRect(), m=c.querySelector('.dtr').getBoundingClientRect(),
            pt=c.querySelector('.dtp').getBoundingClientRect(), mx=(m.left+m.right)/2;
        return mx<w.left+8 || mx>w.right-8 || Math.abs((pt.left+pt.right)/2-mx)>2.5; }).length,
      gap:(mk.length===2?+Math.hypot((mk[0].l+mk[0].r)/2-(mk[1].l+mk[1].r)/2,(mk[0].t+mk[0].b)/2-(mk[1].t+mk[1].b)/2).toFixed(1):null),
      zLine:zLine, zPanel:zPanel, zMark:zMark,
      nums:Array.prototype.map.call(shell.querySelectorAll('.dctarget .dtr i'), function(e){ return e.textContent; })};
  },
  /* the numbers on the CARDS, which have to match the numbers on the course */
  cardNums(ck,h){
    var sc=dScenario(ck,h,0,71);
    var p=dDecisionPanel(sc, function(){}, null, h);
    return Array.prototype.map.call(p.querySelectorAll('.dkc .l .dcn'), function(e){ return e.textContent; });
  },
  /* A CARD LABEL THAT OVERRUNS ITS CARD, which is only visible once it is laid out inside the real panel
     inside the real window. It has to ellipsise rather than be cut mid-word, and ellipsis needs the span
     to be a block: as an inline it silently ignores both overflow and text-overflow. */
  cardFit(ck,h){
    S.daily=true; S.dailySeed=20260101; S.dailyCourse=ck; S.dailySkills={};
    CATS.forEach(function(c){ S.dailySkills[c.k]=80; });
    var holes=(DAILY_COURSES[ck]||{}).holes||[];
    var sc; try{ sc=dScenario(ck,h,0,71); }catch(e){ return null; }
    var node=hvNode({n:h+1,par:holes[h][0],yards:holes[h][1],shots:[]}, null, h, ck, null,null,null);
    var host=document.getElementById('dthost'); host.innerHTML=''; host.appendChild(node);
    var shell=node.querySelector('.hvshell');
    shell.appendChild(dDecisionPanel(sc, function(){}, null, h));
    return Array.prototype.map.call(shell.querySelectorAll('.dkc .l'), function(e){
      return {over:+(e.getBoundingClientRect().width-e.parentElement.getBoundingClientRect().width).toFixed(1),
              block:(getComputedStyle(e).display!=='inline')};
    });
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
  let mOv = 0, lOv = 0, notSame = 0, noLine = 0, chipHit = 0, minGap = 1e9, bad2 = [], zBad = 0;
  let frameHit = 0; const frameEx = [];
  let detached = 0; const detEx = [];
  let greenN = 0, offGreen = 0, lineMiss = 0, badLab = 0, worstOff = 0, offSum = 0;
  let notInGreen = 0, vSlid = 0, worstIn = 0, tooNarrow = 0, overPush = 0, shortPush = 0;
  let midMoved = 0, inward = 0, safeWorst = 0, safeOffGreen = 0;
  let greenPxMin = 1e9, ringMin = 1e9, stillTouch = 0, clearOff = 0, worstPast = 0, worstRing = 0;
  const offEx = [], labEx = [], inEx = [], pushEx = [], past = [];
  for (const r of sample) {
    const m2 = await page.evaluate(a => window.__DT.render(a[0], a[1]), [r.course, r.hole]);
    if (!m2) continue;
    if (m2.markerOverlap) { mOv++; if (bad2.length < 3) bad2.push({ course: r.course, hole: r.hole, kind: 'markers' }); }
    if (m2.labelOverlap) { lOv++; if (bad2.length < 3) bad2.push({ course: r.course, hole: r.hole, kind: 'labels' }); }
    if (!m2.sameSize) notSame++;
    if (m2.lines !== 1) noLine++;
    if (m2.labelOverChip) chipHit++;
    if (m2.detached) { detached += m2.detached; if (detEx.length < 3) detEx.push({ course: r.course, hole: r.hole }); }
    if (m2.outFrame) { frameHit += m2.outFrame; if (frameEx.length < 3) frameEx.push({ course: r.course, hole: r.hole, n: m2.outFrame }); }
    if (!(m2.zLine < m2.zPanel && m2.zPanel < m2.zMark)) zBad++;
    if (m2.gap != null) minGap = Math.min(minGap, m2.gap);
    if (m2.lineMiss) lineMiss += m2.lineMiss;
    const labs = (m2.labs || []).map(s => s.replace(/^\d+/, ''));
    if (labs.join('|') !== 'Aggressive|Safe') { badLab++; if (labEx.length < 3) labEx.push({ course: r.course, hole: r.hole, labs }); }
    if (m2.green) {
      greenN++;
      if (!m2.onMid) { midMoved++; }
      if (!m2.safeHeld) { vSlid++; }
      if (!m2.outward) { inward++; }
      if (m2.safeOff != null) { safeWorst = Math.max(safeWorst, m2.safeOff); if (m2.safeOff > 1) safeOffGreen++; }
      greenPxMin = Math.min(greenPxMin, m2.greenPx); ringMin = Math.min(ringMin, m2.ringPx);
      if (m2.greenPx < 2 * m2.ringPx + 4) tooNarrow++;
      // the pair must end up exactly as far apart as two tappable rings need, or as far as the two aim
      // points already were, whichever is more. Anything wider is a marker moved for no reason.
      const wantGap = Math.max(m2.needPx, m2.natPx);
      if (m2.gapPx > wantGap + 0.7) { overPush++; if (pushEx.length < 3) pushEx.push({ course: r.course, hole: r.hole, gap: m2.gapPx, want: +wantGap.toFixed(2) }); }
      if (m2.gapPx < m2.needPx - 0.7) { shortPush++; if (pushEx.length < 3) pushEx.push({ course: r.course, hole: r.hole, gap: m2.gapPx, need: m2.needPx }); }
      (m2.offs || []).forEach(o => {
        offSum += o; worstOff = Math.max(worstOff, o);
        if (o > 1) { offGreen++; if (offEx.length < 3) offEx.push({ course: r.course, hole: r.hole, off: o, greenPx: m2.greenPx, ringPx: m2.ringPx }); }
      });
      (m2.pastPx || []).forEach((p, k) => {
        if (p <= 0) return;
        past.push(p);
        if (p > worstPast) { worstPast = p; worstRing = m2.ringPx; }
        if (p < m2.ringPx / 2) stillTouch++; else clearOff++;
      });
      (m2.inGreen || []).forEach(o => {
        worstIn = Math.max(worstIn, o);
        if (o > 1) { notInGreen++; if (inEx.length < 3) inEx.push({ course: r.course, hole: r.hole, r: o }); }
      });
    }
  }
  console.log(`    rendered ${sample.length} of them in a real browser`);
  console.log(`    closest any two markers come, centre to centre: ${minGap.toFixed(1)}px`);
  ok('no two markers overlap, anywhere', mOv === 0, { overlapping: mOv, examples: bad2 });
  ok('no two labels overlap, anywhere', lOv === 0, { overlapping: lOv, examples: bad2 });
  ok('both markers are always the same size, so neither can swallow the other', notSame === 0, notSame);
  ok('the leader lines are drawn on every one', noLine === 0, noLine);
  ok('and no label is left sitting under the hole chip', chipHit === 0, chipHit);
  ok('and every label stays on its own marker, its pointer on the ring', detached === 0, { detached, examples: detEx });
  ok('nor hanging off the edge of the window with its word cut in half', frameHit === 0, { off: frameHit, examples: frameEx });
  const z = await page.evaluate(() => window.__DT.render('Augusta National', 0));
  console.log(`    paint order, back to front: lines ${z.zLine}, docked panels ${z.zPanel}, markers ${z.zMark}`);
  ok('the leader lines paint BEHIND the docked cards, never across them',
    zBad === 0 && z.zLine < z.zPanel, { wrong: zBad, line: z.zLine, panel: z.zPanel });
  ok('and the markers stay on top, because they are the tap targets', z.zMark > z.zPanel,
    { marker: z.zMark, panel: z.zPanel });

  /* The owner's report: "if the two options are at the pin or middle, the number one and number two should
     be on the pin and closer to or in the middle of the green." The old minimum gap was 16 PERCENT OF THE
     FRAME against a green about a tenth of the frame across, so it threw both markers clean off the putting
     surface on the one decision whose two options are both on it. An offset of 1.0 below is the green's own
     edge, so everything here has to come in under 1. */
  head('a pin-hunt keeps both markers on the green');
  console.log(`    decisions whose two options are the pin and the middle: ${greenN}`);
  ok('there are some', greenN > 0, greenN);
  console.log(`    in course yards, distance from the green centre in units of its own radius: worst ${worstIn.toFixed(3)}`);
  ok('both aim points are inside the green, on every one', notInGreen === 0, { out: notInGreen, examples: inEx });
  console.log(`    on screen, sideways from the green centre in units of its projected half width: mean ${(offSum / Math.max(1, greenN * 2)).toFixed(3)}, worst ${worstOff.toFixed(3)}`);
  console.log(`    narrowest green drawn: ${greenPxMin.toFixed(1)}px, smallest ring the pair shrank to: ${ringMin.toFixed(1)}px`);
  console.log(`    greens drawn narrower than two readable rings: ${tooNarrow} of ${greenN}`);
  const pMed = past.length ? past.slice().sort((x, y) => x - y)[Math.floor(past.length / 2)] : 0;
  console.log(`    a marker whose centre is past the green's edge: ${past.length} of ${greenN * 2}, median ${pMed.toFixed(1)}px past`);
  console.log(`    of those, the ring still overlaps the putting surface on ${stillTouch}, and clears it on ${clearOff}`);

  /* THE ONE THAT MATTERS. The safe option is captioned the middle of the green on the card beside it, so
     it is read against the green, and a ring off the putting surface is either a lie or an option nobody
     would take (owner). It is therefore never the marker that moves: the aggressive one absorbs the whole
     push, outward along its own side, where the worst it can read as is a harder tuck than the real one. */
  console.log(`    the safe marker, sideways from the green centre, 1.0 being its edge: worst ${safeWorst.toFixed(3)}`);
  ok('the safe marker is never moved off the middle it is named for', midMoved === 0, midMoved);
  ok('so it is never once drawn off the green, on any hole on the site', safeOffGreen === 0, safeOffGreen);
  ok('and the aggressive one is only ever pushed OUTWARD, never back across the middle', inward === 0, inward);

  /* The bound on the push is arithmetic rather than taste. The tracer draws the whole hole, so a 30 yard
     green is about 30 pixels across, and two rings anybody can tap are wider than that on most holes.
     Where they are, the pair cannot both be inside the green, and the honest promise is that the one that
     moves is not moved further than it has to be: exactly one ring's width apart, no more. */
  ok('the pair is never spread wider than two tappable rings need', overPush === 0, { wider: overPush, examples: pushEx });
  ok('and never packed closer than that either, so both stay tappable', shortPush === 0, { closer: shortPush, examples: pushEx });
  /* Stated in PIXELS, because a fraction of a green's own width is meaningless on the holes this is about:
     a green drawn 10px across has a 5px half width, so a marker a single ring away from it reads as three
     green-widths out while being 13 pixels from the middle. The arithmetic bound is one ring: the safe
     marker is inside the green and the aggressive one is exactly a ring's width from it. */
  ok('and no marker is ever more than one ring past the green edge', worstPast <= worstRing + 0.6,
    { worstPast: +worstPast.toFixed(1), ring: +worstRing.toFixed(1) });
  ok('the safe marker is held on both axes, not just one', vSlid === 0, vSlid);

  head('the markers say which option they are');
  ok('every marker reads Aggressive or Safe, in that order', badLab === 0, { wrong: badLab, examples: labEx });
  const ar = await page.evaluate(() => window.__DT.render('Augusta National', 0));
  console.log(`    a screen reader still gets the detail: "${ar.aria[0]}" / "${ar.aria[1]}"`);
  ok('the aria label carries the option number and the aggressive/safe word',
    /^Option 1, aggressive/.test(ar.aria[0] || '') && /^Option 2, safe/.test(ar.aria[1] || ''), ar.aria);

  head('the leader lines end on the markers, not where they started');
  ok('no line points at a position its marker has left', lineMiss === 0, lineMiss);

  head('the numbers tie the course to the cards');
  const nums = await page.evaluate(() => window.__DT.render('Augusta National', 0));
  ok('the markers are numbered 1 and 2', nums.nums.join(',') === '1,2', nums.nums);
  const cardNums = await page.evaluate(() => window.__DT.cardNums('Augusta National', 0));
  ok('and the cards carry the same numbers in the same order', cardNums.join(',') === '1,2', cardNums);

  head('and a card label never runs off its own card');
  let wide = 0, notBlock = 0, worstWide = 0; const wideEx = [];
  for (const r of sample) {
    const f = await page.evaluate(a => window.__DT.cardFit(a[0], a[1]), [r.course, r.hole]);
    if (!f) continue;
    f.forEach(c => {
      if (!c.block) notBlock++;
      if (c.over > 0.6) { wide++; worstWide = Math.max(worstWide, c.over); if (wideEx.length < 3) wideEx.push({ course: r.course, hole: r.hole, over: c.over }); }
    });
  }
  console.log(`    widest a label overran its card by: ${worstWide.toFixed(1)}px`);
  ok('every card label is a block, so nowrap and the ellipsis actually apply', notBlock === 0, notBlock);
  ok('and none is wider than the card it sits in, on any decision on the site',
    wide === 0, { over: wide, examples: wideEx });

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
  await browser.close();
};

try { await run(); } finally { try { fs.unlinkSync(PROBE); } catch (e) {} }
console.log('\n' + (bad ? bad + ' FAILED' : 'all good'));
process.exit(bad ? 1 : 0);
