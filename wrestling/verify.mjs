#!/usr/bin/env node
/* RunTheRopes regression suite. No network. Run from the repo root:

     node wrestling/verify.mjs            full: pages load, careers play, rules hold
     node wrestling/verify.mjs --quick    skip the multi-year careers

   What it proves, in order:
     1. every <script src> in wrestling/** points at a file that exists
        (the booking sim shipped broken for a week because roster.js was
        deleted as "unused" and this was the caller nobody checked)
     2. no trademarked company, event or ring name is in any wrestling file
     3. both pages load headless with zero page errors, and the booking sim
        can start a career and run a show
     4. a championship never changes hands on a DQ or a count-out
     5. careers play out for years without breaking an invariant (the
        playtest harness), with a readable log of what happened

   Needs a chromium. Playwright is resolved from node_modules, then from the
   sandbox's global install. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const QUICK = process.argv.includes('--quick');
const YEARS = +(process.env.YEARS || 4);
const RUNS  = +(process.env.RUNS  || 2);

let fails = 0;
const ok  = (m)=>console.log('  ok   '+m);
const bad = (m)=>{ fails++; console.log('  FAIL '+m); };
const section = (t)=>console.log('\n== '+t);

/* ---------- 1. script tags resolve ---------- */
section('script tags resolve');
const pages = ['wrestling/index.html','wrestling/booking/index.html'];
for(const p of pages){
  const html = fs.readFileSync(path.join(ROOT,p),'utf8');
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
  for(const s of srcs){
    if(/^https?:/.test(s)) continue;
    const file = path.join(ROOT, path.dirname(p), s.split('?')[0]);
    if(fs.existsSync(file)) ok(`${p} -> ${s}`); else bad(`${p} -> ${s} is missing (${file})`);
  }
}

/* ---------- 2. no trademarks ---------- */
section('no trademarked names');
const BLOCK = [
  // companies and shows
  'WWE','AEW','TNA','NJPW','Stardom','TJPW','WrestleMania','SummerSlam','Royal Rumble','Money in the Bank',
  'Elimination Chamber','Hell in a Cell','Survivor Series','Wrestle Kingdom','Premium Live Event',
  // ring names the roster, the mentors and the personalities moved off
  'Stone Cold','The Undertaker','Triple H','Karrion Kross',"'The Rock'",'Mistico','Effy','Hulk Hogan','Hulkamania',
  'Ultimate Warrior','El Santo','Rey Mysterio','Cero Miedo','Tribal Chief',
  // trademarked move and catchphrase names
  'Rock Bottom','Sweet Chin Music','Tombstone Piledriver','Attitude Adjustment','Austin 3:16','One Winged Angel',
  'Styles Clash','Rainmaker','Batista Bomb','Sharpshooter',
];
const files = fs.readdirSync(path.join(ROOT,'wrestling')).filter(f=>/\.(js|html)$/.test(f)).map(f=>'wrestling/'+f)
  .concat(['wrestling/booking/index.html']);
for(const f of files){
  const txt = fs.readFileSync(path.join(ROOT,f),'utf8');
  const hits = BLOCK.filter(t=>new RegExp('(^|[^A-Za-z])'+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^A-Za-z]|$)').test(txt));
  if(hits.length) bad(`${f}: ${hits.join(', ')}`); else ok(f);
}

/* ---------- a tiny static server for the browser checks ---------- */
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if(!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, {'Content-Type': MIME[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0, r));
const PORT = server.address().port;
const URL = `http://localhost:${PORT}`;

let chromium = null;
try { ({chromium} = require('playwright')); }
catch(_){ try{ ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }catch(e){ chromium=null; } }
if(!chromium){
  bad('playwright is not installed; browser checks skipped');
  server.close(); process.exit(fails?1:0);
}
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p=>fs.existsSync(p));
const browser = await chromium.launch(exe ? {executablePath:exe} : {});
const fresh = async (url)=>{
  const page = await browser.newPage({viewport:{width:1200,height:900}});
  const errs = [];
  page.on('pageerror', e=>errs.push(String(e)));
  page.on('console', m=>{ if(m.type()==='error' && !/ERR_CONNECTION|favicon/.test(m.text())) errs.push('console: '+m.text()); });
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(600);
  await page.evaluate(()=>{ try{ localStorage.clear(); }catch(_){} });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForTimeout(600);
  return {page, errs};
};

/* ---------- 3. both pages load and run ---------- */
section('pages load');
{
  const {page, errs} = await fresh(URL+'/wrestling/');
  if(errs.length) bad('career game: '+errs.slice(0,3).join(' | ')); else ok('career game loads clean');
  await page.close();
}
{
  const {page, errs} = await fresh(URL+'/wrestling/booking/');
  let r = null;
  try{
    r = await page.evaluate(()=>{
      const promos = Object.keys(PROMO_META);
      doStart(promos[0]);
      const ws = S.roster.filter(w=>!isManager(w));
      S.card.push({type:'singles', ids:[ws[0].id, ws[1].id], intent:'showcase', winner:ws[0].id, titleId:'', feudId:''});
      runShow();
      return {promos:promos.length, roster:S.roster.length, pool:S.pool.length, week:S.week, grade:S.history[0].metrics.grade, title:S.titles[0].name};
    });
  }catch(e){ errs.push('evaluate: '+e.message); }
  if(errs.length) bad('booking sim: '+errs.slice(0,3).join(' | '));
  else if(!r || r.week!==2 || !r.grade) bad('booking sim did not run a show: '+JSON.stringify(r));
  else ok(`booking sim starts a career (${r.promos} promotions, ${r.roster} on the roster, ${r.pool} in the pool) and runs a show (grade ${r.grade}, ${r.title})`);
  await page.close();
}

/* ---------- 4. the title rule ---------- */
section('a belt never moves on a DQ or a count-out');
{
  const {page, errs} = await fresh(URL+'/wrestling/');
  await page.evaluate(()=>{ quickStart(); });
  await page.waitForTimeout(800);
  const r = await page.evaluate(()=>{
    try{ endTour(); closeModal(); }catch(_){}
    const out = [];
    const belt = beltName();
    const offer = (stakes, extra)=>Object.assign({ oppId:houseRoster(myPromoId())[0].id, oppName:'Test Opponent', oppOvr:40,
      stip:'singles', stipLabel:'Singles Match', mult:1, purse:500, stakes, card:'Main Event', belt }, extra||{});
    const run = (label, stakes, finish, win, expectTitle)=>{
      const o = offer(stakes);
      const res = { quality:60, win, good:[], bad:[], used:[], nearFalls:1, time:'10:00', finish };
      applyMatch(o, res);
      const holds = G.car.title===belt;
      out.push({label, holds, expect:expectTitle, retained:res.retainedDirty||null});
    };
    // challenger wins by DQ: no belt
    G.car.title=null; G.car.titleShot={promoId:myPromoId(), y:G.car.year, w:G.car.week, kind:'world', belt};
    run('challenger wins by DQ', 'title', {type:'dq', by:true}, true, false);
    out[out.length-1].shotKept = !!G.car.titleShot;
    // challenger wins by count-out: no belt
    G.car.title=null; run('challenger wins by count-out', 'title', {type:'count', by:true}, true, false);
    // challenger wins by pin: belt
    G.car.title=null; run('challenger wins by pin', 'title', {type:'pin', by:true}, true, true);
    // champion loses by DQ: keeps belt
    G.car.title=belt; G.car.defenses=0; run('champion loses by DQ', 'defense', {type:'dq', by:false}, false, true);
    // champion loses by count-out: keeps belt
    G.car.title=belt; run('champion loses by count-out', 'defense', {type:'count', by:false}, false, true);
    // champion loses by pin: loses belt
    G.car.title=belt; run('champion loses by pin', 'defense', {type:'pin', by:false}, false, false);
    return out;
  });
  if(errs.length) bad('title rule page errors: '+errs.slice(0,2).join(' | '));
  for(const t of r){
    if(t.holds===t.expect) ok(`${t.label}: holds=${t.holds}${t.retained?` (retained by ${t.retained})`:''}${t.shotKept!=null?`, shot kept=${t.shotKept}`:''}`);
    else bad(`${t.label}: holds=${t.holds}, expected ${t.expect}`);
  }
  const dq = r.find(t=>t.label==='challenger wins by DQ');
  if(dq && !dq.shotKept) bad('a challenger who won by DQ lost their title shot');
  await page.close();
}

/* ---------- 4b. the first night ---------- */
section('the first night is a show, not a sheet');
{
  const {page, errs} = await fresh(URL+'/wrestling/');
  await page.evaluate(()=>{ quickStart(); });
  await page.waitForTimeout(800);
  const r = await page.evaluate(async ()=>{
    try{ endTour(); closeModal(); }catch(_){}
    const out={};
    ['gcw','cdp','scw','rose','sbcw'].forEach(p=>{ out['room_'+p]=houseRoster(p).length; });
    const o=G.car.booking && G.car.booking.o;
    out.bookedMatch = !!(G.car.booking && G.car.booking.type==='match');
    if(o){ out.oppHoldsBelt = titlesHeldBy(o.oppId).length>0; out.nonTitleBanner = !!o.nonTitleVsChamp; out.opp=o.oppName; }
    // walk to the ring: the night-one scene must be the one that plays
    goBooking();
    await new Promise(r=>setTimeout(r,500));
    const tag=document.querySelector('#sceneBody .scene-tag');
    out.sceneTag = tag ? tag.textContent.trim() : null;
    // step through the scene: an option, then whatever continue button the
    // note leaves behind, until the fight has actually started
    // (the pre-bell "Your first match" explainer is a modal that holds the
    // bell until it is dismissed; dismiss it the way a player would)
    for(let i=0;i<8 && !(typeof MS!=='undefined' && MS && !MS.ended);i++){
      const sceneOpen=document.getElementById('sceneBack').classList.contains('open');
      const opt=sceneOpen && document.querySelector('#sceneBody .scene-opt');
      const cont=sceneOpen && document.querySelector('#sceneBody .scene-continue button');
      const mb=document.querySelector('#modalBack.open #modalBtns button');
      // a modal on top of everything gets dismissed first, then the scene
      if(mb) mb.click(); else if(opt) opt.click(); else if(cont) cont.click();
      await new Promise(r=>setTimeout(r,900));
    }
    out.fightStarted = !!(typeof MS!=='undefined' && MS);
    // let the match resolve without playing it, tap away any milestone card
    // (a first win queues one and the debrief waits behind it), then wait
    // for the debrief
    try{ skipFight(); }catch(e){ out.skipErr=e.message; }
    await new Promise(r=>setTimeout(r,2600));
    for(let i=0;i<4;i++){
      const mo=document.getElementById('momentBack');
      if(mo && mo.classList.contains('open')){ try{ nextMoment(); }catch(_){} await new Promise(r=>setTimeout(r,700)); }
      else break;
    }
    await new Promise(r=>setTimeout(r,1400));
    out.debrief = !!(G.car.coachSeen && G.car.coachSeen.firstNight);
    out.modalTitle = (document.getElementById('modalTitle')||{}).textContent||'';
    out.modalOpen = document.getElementById('modalBack').classList.contains('open');
    // the result carries what moved, and Continue opens the dirt sheet
    out.moved = !!(LAST_RESULT && LAST_RESULT.res && LAST_RESULT.res.moved && LAST_RESULT.res.moved.length===7);
    out.movedStrip = !!document.querySelector('#mBody .moved');
    closeModal(); leaveResult();
    await new Promise(r=>setTimeout(r,400));
    out.dirtTitle = (document.getElementById('modalTitle')||{}).textContent||'';
    out.dirtHead = (document.querySelector('#modalBody .dirt-head')||{}).textContent||'';
    return out;
  });
  if(errs.length) bad('first night page errors: '+errs.slice(0,2).join(' | '));
  for(const p of ['gcw','cdp','scw','rose']) (r['room_'+p]>=5) ? ok(`${p} has ${r['room_'+p]} wrestlers`) : bad(`${p} has only ${r['room_'+p]} wrestlers`);
  if(!r.bookedMatch) bad('week one is not a match');
  else {
    (r.oppHoldsBelt===false) ? ok(`debut opponent (${r.opp}) holds no belt`) : bad(`debut opponent (${r.opp}) is a champion`);
    (!r.nonTitleBanner) ? ok('no non-title banner on the debut') : bad('debut sheet shows the non-title banner');
  }
  (r.sceneTag==='YOUR FIRST NIGHT') ? ok('the night-one scene plays at the curtain') : bad('night-one scene did not play: '+r.sceneTag);
  (r.debrief && r.modalOpen && /first night/i.test(r.modalTitle)) ? ok('the first-result debrief opened') : bad('no first-result debrief: '+JSON.stringify({debrief:r.debrief, open:r.modalOpen, title:r.modalTitle, skip:r.skipErr}));
  (r.moved && r.movedStrip) ? ok('the result carries what moved (7 rows) and renders the strip') : bad('what-moved missing: '+JSON.stringify({moved:r.moved, strip:r.movedStrip}));
  (/dirt sheet/i.test(r.dirtTitle) && r.dirtHead) ? ok(`Continue opens the dirt sheet: "${r.dirtHead}"`) : bad('no dirt sheet after Continue: '+JSON.stringify({title:r.dirtTitle}));
  await page.close();
}

/* ---------- 4c. numbers carry context ---------- */
section('every number on a tile has a band beside it');
{
  const {page, errs} = await fresh(URL+'/wrestling/');
  await page.evaluate(()=>{ quickStart(); });
  await page.waitForTimeout(800);
  const r = await page.evaluate(()=>{
    try{ endTour(); closeModal(); }catch(_){}
    const bare=[];
    const scan=(screen)=>{
      document.querySelectorAll('.screen.active .tile').forEach(t=>{
        const v=t.querySelector('.val'); if(!v) return;
        const txt=(v.childNodes[0]&&v.childNodes[0].textContent||v.textContent).trim();
        const numeric=/^[\d,.%$+\-]+$/.test(txt);
        if(numeric && !v.querySelector('.numband') && !t.querySelector('.numband')){
          bare.push(`${screen}: ${(t.querySelector('.lab')||{}).textContent} = ${txt}`);
        }
      });
    };
    G.car._detailsOpen=true; renderCareer(); scan('hub');
    const o=G.car.booking && G.car.booking.o;
    if(o){ const res=simMatch(o); applyMatch(o,res); renderMatch(o,res); go('match'); scan('result'); }
    go('record'); scan('record');
    return {bare};
  });
  if(errs.length) bad('numbers page errors: '+errs.slice(0,2).join(' | '));
  // tiles that are legitimately a count with no scale (a record, a total)
  const allowed=/Record|Title Reigns|Moves Known|Years Active|Coins|Shards|Career Earnings|Injuries|Titles|Moves|Years/;
  const offenders=r.bare.filter(b=>!allowed.test(b));
  if(offenders.length) bad('bare numbers: '+offenders.join(' | ')); else ok(`no bare numbers on the hub, the result or the record (${r.bare.length} counted-only tiles allowed)`);
  await page.close();
}

/* ---------- 4d. promos know their stage ---------- */
section('promos know which beat of which story they are in');
{
  const {page, errs} = await fresh(URL+'/wrestling/');
  await page.evaluate(()=>{ quickStart(); });
  await page.waitForTimeout(800);
  const r = await page.evaluate(()=>{
    try{ endTour(); closeModal(); }catch(_){}
    const out={segments:0, stageMiss:[], emptyLines:0, dash:0, callbacksSeen:{}, alignTagged:0, generic:0};
    const DASHES=[String.fromCharCode(8212),String.fromCharCode(8211)];
    const hasDash=s=>DASHES.some(d=>String(s||'').indexOf(d)>=0);
    const rv=houseRoster(myPromoId())[1];
    const stages=[['none',null],['opening',0],['escalation',1],['personal',2],['final',3]];
    for(const align of ['face','heel']){
      G.w.align=align;
      for(const [label,stage] of stages){
        for(const kind of ['grudge','title','betrayal','underdog','veteran']){
          if(stage==null){ G.story=null; G.car.rivalId=null; }
          else { startStory(rv.id,'test'); story().stage=stage; story().kind=kind; story().events=1; }
          // plant the facts callbacks read
          rel(rv.id).betrayedMe = (kind==='betrayal');
          PM={mode:'callout',target:rv,directive:'feud',stance:'comply',phase:'hook',beat:0,maxBeats:5,score:0,usedChips:{},usedLines:{},usedCuts:{},picking:[]};
          PMCTX=buildPromoCtx(rv);
          const tags=stakesForPromo(PMCTX);
          const stageTag=tags.find(t=>/^stage_/.test(t));
          for(const ph of ['hook','thesis','meat','personal','close']){
            PM.phase=ph; PM.beat=['hook','thesis','meat','personal','close'].indexOf(ph);
            const cuts=cutsFor(ph); const chips=chipsFor(ph);
            out.segments++;
            const stageCutExists=CUT_BANK.some(c=>c.phase.includes(ph)&&c.stakes&&stageTag&&c.stakes.includes(stageTag));
            if(stageTag && stageCutExists && !cuts.some(c=>(c.stakes||[]).includes(stageTag))) out.stageMiss.push(`${align}/${label}/${kind}/${ph}`);
            cuts.forEach(c=>{ let l=''; try{ l=c.line(PMCTX); }catch(_){} if(!l) out.emptyLines++; if(hasDash(l)) out.dash++; if(c.align) out.alignTagged++; if(!c.stakes) out.generic++; });
            chips.forEach(ch=>{ const l=chipLine(ch,PMCTX); if(!l) out.emptyLines++; if(hasDash(l)) out.dash++; if(/^cb_/.test(ch.id)) out.callbacksSeen[ch.id]=(out.callbacksSeen[ch.id]||0)+1; });
          }
        }
      }
    }
    G.story=null; G.car.rivalId=null; rel(rv.id).betrayedMe=false;
    return out;
  });
  if(errs.length) bad('promo sweep page errors: '+errs.slice(0,2).join(' | '));
  (r.stageMiss.length===0) ? ok(`${r.segments} beats swept across 2 alignments x 5 stages x 5 kinds: a stage cut is offered wherever one exists`) : bad('stage cut missing in: '+r.stageMiss.slice(0,6).join(', ')+` (${r.stageMiss.length})`);
  (r.emptyLines===0) ? ok('no cut or chip rendered an empty line') : bad(`${r.emptyLines} empty lines`);
  (r.dash===0) ? ok('no dashes in any generated line') : bad(`${r.dash} generated lines carry a dash`);
  (Object.keys(r.callbacksSeen).length>=1) ? ok('event callback chips surface when the fact exists: '+JSON.stringify(r.callbacksSeen)) : bad('no callback chip surfaced with events planted');
  await page.close();
}

/* ---------- 4e. backstage is a conversation ---------- */
section('backstage rooms and the office are conversations');
{
  const {page, errs} = await fresh(URL+'/wrestling/');
  await page.evaluate(()=>{ quickStart(); });
  await page.waitForTimeout(800);
  const r = await page.evaluate(async ()=>{
    try{ endTour(); closeModal(); }catch(_){}
    const out={};
    go('backstage');
    const st=backstageState(); const who=st.layout.flatMap(r=>r.occ)[0];
    backstageOpen(who);
    await new Promise(r=>setTimeout(r,300));
    out.sceneOpen=document.getElementById('sceneBack').classList.contains('open');
    out.tag=(document.querySelector('#sceneBody .scene-tag')||{}).textContent||'';
    out.opts=document.querySelectorAll('#sceneBody .scene-opt').length;
    const usedBefore=backstageState().used;
    const opt=[...document.querySelectorAll('#sceneBody .scene-opt')].find(e=>/Run through a spot|Bury the hatchet/.test(e.textContent))||document.querySelector('#sceneBody .scene-opt');
    if(opt) opt.click();
    await new Promise(r=>setTimeout(r,1500));
    out.usedAfter=backstageState().used;
    out.outcome=(document.getElementById('sceneOutLine')||{}).textContent||'';
    const cont=document.querySelector('#sceneBody .scene-continue button'); if(cont) cont.click();
    await new Promise(r=>setTimeout(r,300));
    out.segmentStillFree = !segmentsPlayedThisWeek();
    backstageOpenGM();
    await new Promise(r=>setTimeout(r,300));
    out.gmTag=(document.querySelector('#sceneBody .scene-tag')||{}).textContent||'';
    out.gmName=(document.querySelector('#sceneBody .scene-who')||{}).textContent||'';
    closeScene();
    return out;
  });
  if(errs.length) bad('backstage page errors: '+errs.slice(0,2).join(' | '));
  (r.sceneOpen && /BACKSTAGE/.test(r.tag) && r.opts>=3) ? ok(`walking into a room opens a conversation (${r.tag}, ${r.opts} things to say)`) : bad('backstage did not open as a scene: '+JSON.stringify(r));
  (r.usedAfter===r.usedBefore+1 || r.usedAfter===1) ? ok(`choosing a line runs the action (visits used ${r.usedAfter}) and types the outcome: "${r.outcome.slice(0,80)}"`) : bad('backstage option did not run: '+JSON.stringify(r));
  r.segmentStillFree ? ok('a backstage chat does not use up the walk to gorilla') : bad('backstage chat consumed the pre-match segment');
  (/OFFICE/.test(r.gmTag) && r.gmName) ? ok(`the office is a conversation with ${r.gmName.trim()}`) : bad('office did not open as a scene: '+JSON.stringify({tag:r.gmTag, name:r.gmName}));
  await page.close();
}

/* ---------- 4f. the storyline has scenes ---------- */
section('each beat of a story has a scene on the walk to the ring');
{
  const {page, errs} = await fresh(URL+'/wrestling/');
  await page.evaluate(()=>{ quickStart(); });
  await page.waitForTimeout(800);
  const r = await page.evaluate(()=>{
    try{ endTour(); closeModal(); }catch(_){}
    const out={};
    G.car.rec.w=1;                       // past night one, so the priority scene stands down
    const rv=houseRoster(myPromoId())[1];
    const pick=(trig)=>{ const sc=pickScene(trig); return sc?sc.id:null; };
    const reset=()=>{ G.car._scenesSeen=[]; G.car._sceneMem={}; };
    const setup=(kind,stage)=>{ G.story=null; G.car.rivalId=null; startStory(rv.id,'test'); story().kind=kind; story().stage=stage; reset(); };
    setup('grudge',1);   out.s1=pick('prematch');
    setup('grudge',2);   out.s2=pick('prematch');
    setup('grudge',3);   out.s3=pick('prematch');
    setup('title',3);    out.s3title=pick('prematch');
    setup('betrayal',0); out.betrayal=pick('prematch');
    setup('veteran',1);  out.veteran=pick('prematch');
    setup('underdog',1); out.underdog=pick('prematch');
    // after the blow-off, the hallway afterwards
    setup('grudge',3); endStory('respect'); reset(); out.post=pick('any');
    G.story=null; G.car.rivalId=null;
    return out;
  });
  if(errs.length) bad('storyline scene page errors: '+errs.slice(0,2).join(' | '));
  const want={s1:'feud_s1', s2:'feud_s2', s3:'feud_s3', s3title:'feud_s3_signing', betrayal:'betrayal_open', veteran:'veteran_lesson', underdog:'underdog_pep', post:'feud_post'};
  Object.keys(want).forEach(k=>{ (r[k]===want[k]) ? ok(`${k}: ${r[k]}`) : bad(`${k}: expected ${want[k]}, picked ${r[k]}`); });
  await page.close();
}

/* ---------- 4g. every story kind has a way in ----------
   Betrayal and underdog were proven reachable by scene id and never fired
   in fifteen career-years, because nothing in play could assign them. This
   drives each door directly. */
section('every story kind has a way in');
{
  const {page, errs} = await fresh(URL+'/wrestling/');
  await page.evaluate(()=>{ quickStart(); });
  await page.waitForTimeout(800);
  const r = await page.evaluate(()=>{
    try{ endTour(); closeModal(); }catch(_){}
    const out={};
    G.car.rec.w=1;
    const roster=houseRoster(myPromoId());
    const top=roster.slice().sort((a,b)=>(b.over||55)-(a.over||55))[0];
    const reset=()=>{ G.story=null; G.car.rivalId=null; G.car._scenesSeen=[]; G.car._sceneMem={}; G.car.storiesResolved=[]; };
    // 1. underdog: lose twice to the best in the room, in matches worth watching
    reset(); const R=rel(top.id); R.wins=0; R.losses=0; R.matches=0; R.heat=0; R.cooldown=0;
    const offer=(gap)=>({oppId:top.id, oppName:top.name, oppOvr:ovr(G.w)+gap, stip:'singles', stipLabel:'Singles Match', mult:1, purse:400, stakes:'standard', card:'Mid-Card'});
    const loss=()=>({quality:60, win:false, good:[], bad:[], used:[], nearFalls:2, time:'11:00', finish:{type:'pin', by:false}});
    applyMatch(offer(2), loss());
    out.underdogAfterOne = story() ? story().kind : null;
    if(!story()) applyMatch(offer(2), loss());
    out.underdogAfterTwo = story() ? story().kind : null;
    out.underdogReason = story() ? story().reason : null;
    G.car._scenesSeen=[]; G.car._sceneMem={};
    out.underdogScene = (pickScene('prematch')||{}).id;
    // 2. jealousy: a belt they do not share pulls loyalty down
    reset();
    // a partner with no belt of their own, or there is nothing to be jealous of
    const mate=roster.find(x=>x.id!==top.id && !titlesHeldBy(x.id).length) || roster.find(x=>x.id!==top.id);
    G.car.allies=[]; formAlliance(mate.id); const a=allyOf(mate.id);
    G.car.streak=0;
    a.loyalty=60; G.car.title=null;      for(let i=0;i<10;i++) weeklyLoyalty(); out.driftNoBelt=Math.round((a.loyalty-60)*10)/10;
    a.loyalty=60; G.car.title=beltName(); for(let i=0;i<10;i++) weeklyLoyalty(); out.driftBelt=Math.round((a.loyalty-60)*10)/10;
    G.car.title=null;
    // 3. the wavering ally stops you at the curtain, and the inbox warned you first
    a.loyalty=33; a._warned=false; weeklyLoyalty();
    out.warned=!!a._warned && (G.car.inbox||[]).some(i=>/gone quiet/.test(i.txt));
    G.car._scenesSeen=[]; G.car._sceneMem={};
    out.waveringScene=(pickScene('prematch')||{}).id;
    // 4. a betrayal eclipses a live feud with somebody else
    const other=roster.find(x=>x.id!==top.id && x.id!==mate.id);
    startStory(other.id,'test'); story().kind='grudge'; story().stage=2;
    a.loyalty=5; let turned=null; for(let i=0;i<80 && !turned;i++) turned=checkBetrayal();
    out.turned=!!turned;
    out.betrayalKind=story()?story().kind:null; out.betrayalWith=!!story() && story().charId===mate.id;
    out.betrayalReason=story()?story().reason:null;
    out.droppedRecorded=((G.car.storiesResolved||[])[0]||{}).resolution;
    G.car._scenesSeen=[]; G.car._sceneMem={};
    out.betrayalScene=(pickScene('prematch')||{}).id;
    out.anyScene=(pickScene('any')||{}).id;
    reset(); G.car.allies=[];
    return out;
  });
  if(errs.length) bad('story kinds page errors: '+errs.slice(0,2).join(' | '));
  (r.underdogAfterTwo==='underdog') ? ok(`two losses to the best in the room start an underdog story: "${r.underdogReason}"`) : bad(`underdog did not start: after one=${r.underdogAfterOne}, after two=${r.underdogAfterTwo}`);
  (r.underdogScene==='underdog_pep') ? ok('and the pep talk plays at the curtain') : bad(`underdog scene: picked ${r.underdogScene}`);
  (r.driftBelt < r.driftNoBelt - 3) ? ok(`a belt they do not share breeds jealousy: ${r.driftNoBelt} over ten weeks without, ${r.driftBelt} with`) : bad(`no jealousy: drift ${r.driftNoBelt} without a belt, ${r.driftBelt} with`);
  r.warned ? ok('the inbox warns once when an ally goes under 35') : bad('no warning when an ally goes under 35');
  (r.waveringScene==='ally_wavering') ? ok('a wavering ally stops you at the curtain') : bad(`wavering scene: picked ${r.waveringScene}`);
  r.turned ? ok('an ally at 5 loyalty turns') : bad('an ally at 5 loyalty never turned in 80 weeks');
  (r.betrayalKind==='betrayal' && r.betrayalWith) ? ok(`the turn becomes the story, over the live grudge: "${r.betrayalReason}"`) : bad(`after the turn the story is ${r.betrayalKind}, with the betrayer=${r.betrayalWith}`);
  (r.droppedRecorded==='dropped') ? ok('the eclipsed feud is recorded as dropped') : bad(`eclipsed feud recorded as ${r.droppedRecorded}`);
  (r.betrayalScene==='betrayal_open') ? ok('and the turn plays at the curtain') : bad(`betrayal scene: picked ${r.betrayalScene}`);
  (r.anyScene!=='feud_post') ? ok('the hallway afterwards does not play for a dropped feud') : bad('feud_post played for a dropped feud');
  await page.close();
}

/* ---------- 5. careers play out ---------- */
const KINDS_SEEN={};
if(!QUICK){
  section(`${RUNS} careers x ${YEARS} years`);
  for(let run=0; run<RUNS; run++){
    const {page, errs} = await fresh(URL+'/wrestling/');
    await page.evaluate(()=>{ quickStart(); });
    await page.waitForTimeout(800);
    const result = await page.evaluate(async (YEARS)=>{
      try{ endTour(); closeModal(); }catch(_){}
      const problems=[], log=[];
      const P=(msg,ctx)=>problems.push(Object.assign({msg, y:G.car.year, w:G.car.week}, ctx||{}));
      const startYear=G.car.year; let guard=0;
      let matches=0, wins=0, titleWins=0, dirty=0, stories=0, promos=0, alliesFormed=0, lastSk=null; const kinds={}, scenesPlayed={};
      while(G.car.year < startYear+YEARS && guard++<4000){
        const c=G.car;
        // a story can start anywhere now (a match, a promo, a partner turning
        // on you in the weekly tick), so count it by identity, not by branch
        const sk=story()?`${story().charId}:${story().startYear}:${story().startWeek}`:null;
        if(sk && sk!==lastSk){ stories++; const k=story().kind||'?'; kinds[k]=(kinds[k]||0)+1;
          log.push(`Y${c.year}W${c.week} ${(STORY_KINDS[k]||{}).name||k} with ${charById(story().charId).name}: ${story().reason}`); }
        lastSk=sk;
        // a player who is winning makes friends: shake on it with the first
        // person who rates you, a couple of times a year, so a partner can
        // exist to turn on you
        if(matches%12===5 && allies().length<2 && !c._shookThisMatch){
          const f=houseRoster(myPromoId()).find(x=>canAlly(x.id));
          if(f){ formAlliance(f.id); alliesFormed++; c._shookThisMatch=true; }
        }
        if(matches%12!==5) c._shookThisMatch=false;
        if(!(c.cond>=0&&c.cond<=100)) P('condition out of range',{cond:c.cond});
        if(!(c.pop>=0&&c.pop<=100)) P('pop out of range',{pop:c.pop});
        if(!(c.standing>=0&&c.standing<=100)) P('standing out of range',{standing:c.standing});
        if(c.rep<0) P('negative reputation');
        if(G.bag.coins<0) P('negative coins');
        if(c.title && !c.reigns.some(r=>r.title===c.title && !r.lostYear)) P('holding a title with no open reign',{title:c.title});
        const sg=currentSeasonGoal(); if(!sg) P('no season goal');
        const st=story();
        if(st){ const rv=charById(st.charId); if(!rv) P('story points at a missing character');
          else if(G.world.retired && G.world.retired[rv.id]) P('story points at a retired wrestler',{name:rv.name});
          if(!st.reason) P('story has no reason');
          // weeks the player spent injured do not count: nobody can book a
          // feud for somebody in rehab
          const nowAbs=c.year*WEEKS_PER_YEAR+c.week, sinceAbs=nowAbs-(st.lastBooked||(st.startYear*WEEKS_PER_YEAR+st.startWeek))-(st._injWeeks||0);
          if(sinceAbs>20) P('feud unbooked for 20+ weeks',{weeks:sinceAbs, stage:st.stage}); }
        (c.storiesResolved||[]).forEach(r=>{ if(!r.reason && r.kind) P('resolved story without a reason',{name:r.name}); });
        while(G.w.tp>0){ const b=G.w.tp; try{ spendTP((catById(c.plan.a)||{}).attr||'po'); }catch(_){ G.w.tp--; } if(G.w.tp>=b) G.w.tp--; }
        if(c.retired){ log.push(`Y${c.year} retired at ${c.age}`); break; }
        if(c.freeAgent){ try{ signDeal(0); }catch(_){ c.freeAgent=false; } continue; }
        if(c.injWeeks>0){ if(story()) story()._injWeeks=(story()._injWeeks||0)+1; doRest(); continue; }
        if(c.mentorWeeks>0){ doMentorWeek(); continue; }
        try{ bookWeek(); }catch(e){ P('bookWeek threw: '+e.message); break; }
        const b=c.booking; if(!b){ P('no booking'); advanceWeek(); continue; }
        if(b.type==='match'){
          const o=b.o; const titleBefore=c.title, stBefore=story()&&story().charId;
          // Walk to gorilla. The UI plays a scene here; headless we pick the
          // same scene, take the first line and apply it, so a career proves
          // story beats actually surface and their effects survive real state.
          try{
            const sc=pickScene('prematch');
            if(sc){
              const x=sceneCtx();
              let cast=null; try{ cast=sc.cast?sc.cast(x):{a:null}; }catch(_){ cast=null; }
              if(sc.cast && (!cast||!cast.a)){ /* no lead, no scene, as playScene rules */ }
              else{
                Object.assign(x, cast||{});
                c._scenesSeen=(c._scenesSeen||[]).concat([sc.id]).slice(-40);
                scenesPlayed[sc.id]=(scenesPlayed[sc.id]||0)+1;
                const start=sc.beats&&sc.beats.start;
                if(start){
                  let line=''; try{ line=typeof start.line==='function'?start.line(x):start.line; }catch(e){ P('scene line threw: '+e.message,{scene:sc.id}); }
                  if(!line) P('scene rendered an empty line',{scene:sc.id});
                  if(line && (line.indexOf(String.fromCharCode(8212))>=0||line.indexOf(String.fromCharCode(8211))>=0)) P('scene line has a dash',{scene:sc.id});
                  let opts=[]; try{ opts=typeof start.opts==='function'?start.opts(x):(start.opts||[]); }catch(e){ P('scene opts threw: '+e.message,{scene:sc.id}); }
                  if(!opts.length) P('scene offered nothing to say',{scene:sc.id});
                  // rotate through the options so every line gets said over a career
                  const pick=opts[matches%opts.length];
                  if(pick){
                    if(pick.eff) applySceneEffect(pick.eff, x);
                    if(pick.mem) sceneRemember(pick.mem);
                  }
                }
                if(!sc.noMark) markSegmentPlayed();
              }
            }
          }catch(e){ P('prematch scene threw: '+e.message); }
          let res; try{ res=simMatch(o); }catch(e){ P('simMatch threw: '+e.message,{stip:o.stipLabel}); advanceWeek(); continue; }
          // one match in eight ends dirty, so the title rule is exercised in play
          if(matches%8===3 && (o.stakes==='title'||o.stakes==='defense')){ res.finish={type:'dq', by:res.win}; }
          try{ applyMatch(o,res); }catch(e){ P('applyMatch threw: '+e.message,{stip:o.stipLabel}); }
          matches++; if(res.win) wins++;
          if(!(res.moved && res.moved.length===7)) P('result has no what-moved rows',{stip:o.stipLabel});
          if(res.retainedDirty){ dirty++; if(c.title!==titleBefore) P('belt moved on a '+res.retainedDirty,{stakes:o.stakes}); }
          if(!titleBefore && c.title){ titleWins++; log.push(`Y${c.year}W${c.week} won the ${c.title} from ${o.oppName} (${res.quality})`); }
          if(stBefore && !story()){ const r0=(c.storiesResolved||[])[0]||{}; log.push(`Y${c.year}W${c.week} feud settled ${r0.resolution||''} after ${r0.matches||0} matches (avg ${r0.avg||0})${res.storyEnded?' · ceremony':''}`); }
          // applyMatch ends the week itself. Calling advanceWeek here too
          // skipped every other week and halved the match count for months
          // before anybody noticed.
          continue;
        } else if(b.type==='promo'){ promos++; }
        try{ advanceWeek(); }catch(e){ P('advanceWeek threw: '+e.message); break; }
      }
      (G.car.storiesResolved||[]).forEach(r=>{ if(!r.kind) P('resolved story without a kind',{name:r.name}); });
      const storyScenes=Object.keys(scenesPlayed).filter(id=>/^(feud_|betrayal_open|veteran_lesson|underdog_pep)/.test(id)).reduce((n,id)=>n+scenesPlayed[id],0);
      return {problems, log, summary:{years:G.car.year-startYear, matches, wins, titleWins, dirty, stories, kinds, storyScenes, scenesPlayed, allies:alliesFormed, dropped:(G.car.storiesResolved||[]).filter(r=>r.resolution==='dropped').length, promos, ovr:ovr(G.w), pop:Math.round(G.car.pop), rooms:sentiment()}};
    }, YEARS);
    if(errs.length) bad(`run ${run} page errors: `+errs.slice(0,3).join(' | '));
    if(result.problems.length){ bad(`run ${run}: ${result.problems.length} problems`); result.problems.slice(0,6).forEach(p=>console.log('       '+JSON.stringify(p))); }
    else ok(`run ${run}: ${JSON.stringify(result.summary)}`);
    Object.keys(result.summary.kinds||{}).forEach(k=>{ KINDS_SEEN[k]=(KINDS_SEEN[k]||0)+result.summary.kinds[k]; });
    result.log.slice(0,12).forEach(l=>console.log('       '+l));
    await page.close();
  }
}

if(!QUICK){
  const n=Object.keys(KINDS_SEEN).length;
  (n>=2) ? ok(`story kinds seen across the careers: ${JSON.stringify(KINDS_SEEN)}`) : bad(`only ${n} story kind(s) seen across the careers: ${JSON.stringify(KINDS_SEEN)}`);
}
await browser.close();
server.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails?1:0);
