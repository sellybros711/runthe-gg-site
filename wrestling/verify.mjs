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
  await page.close();
}

/* ---------- 5. careers play out ---------- */
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
      let matches=0, wins=0, titleWins=0, dirty=0, stories=0, promos=0;
      while(G.car.year < startYear+YEARS && guard++<4000){
        const c=G.car;
        if(!(c.cond>=0&&c.cond<=100)) P('condition out of range',{cond:c.cond});
        if(!(c.pop>=0&&c.pop<=100)) P('pop out of range',{pop:c.pop});
        if(!(c.standing>=0&&c.standing<=100)) P('standing out of range',{standing:c.standing});
        if(c.rep<0) P('negative reputation');
        if(G.bag.coins<0) P('negative coins');
        if(c.title && !c.reigns.some(r=>r.title===c.title && !r.lostYear)) P('holding a title with no open reign',{title:c.title});
        const sg=currentSeasonGoal(); if(!sg) P('no season goal');
        const st=story();
        if(st){ const rv=charById(st.charId); if(!rv) P('story points at a missing character');
          else if(G.world.retired && G.world.retired[rv.id]) P('story points at a retired wrestler',{name:rv.name}); }
        while(G.w.tp>0){ const b=G.w.tp; try{ spendTP((catById(c.plan.a)||{}).attr||'po'); }catch(_){ G.w.tp--; } if(G.w.tp>=b) G.w.tp--; }
        if(c.retired){ log.push(`Y${c.year} retired at ${c.age}`); break; }
        if(c.freeAgent){ try{ signDeal(0); }catch(_){ c.freeAgent=false; } continue; }
        if(c.injWeeks>0){ doRest(); continue; }
        if(c.mentorWeeks>0){ doMentorWeek(); continue; }
        try{ bookWeek(); }catch(e){ P('bookWeek threw: '+e.message); break; }
        const b=c.booking; if(!b){ P('no booking'); advanceWeek(); continue; }
        if(b.type==='match'){
          const o=b.o; const titleBefore=c.title, stBefore=story()&&story().charId;
          let res; try{ res=simMatch(o); }catch(e){ P('simMatch threw: '+e.message,{stip:o.stipLabel}); advanceWeek(); continue; }
          // one match in eight ends dirty, so the title rule is exercised in play
          if(matches%8===3 && (o.stakes==='title'||o.stakes==='defense')){ res.finish={type:'dq', by:res.win}; }
          try{ applyMatch(o,res); }catch(e){ P('applyMatch threw: '+e.message,{stip:o.stipLabel}); }
          matches++; if(res.win) wins++;
          if(res.retainedDirty){ dirty++; if(c.title!==titleBefore) P('belt moved on a '+res.retainedDirty,{stakes:o.stakes}); }
          if(!titleBefore && c.title){ titleWins++; log.push(`Y${c.year}W${c.week} won the ${c.title} from ${o.oppName} (${res.quality})`); }
          if(!stBefore && story()) { stories++; log.push(`Y${c.year}W${c.week} feud starts with ${charById(story().charId).name}`); }
          if(stBefore && !story()) log.push(`Y${c.year}W${c.week} feud settled`);
          // applyMatch ends the week itself. Calling advanceWeek here too
          // skipped every other week and halved the match count for months
          // before anybody noticed.
          continue;
        } else if(b.type==='promo'){ promos++; }
        try{ advanceWeek(); }catch(e){ P('advanceWeek threw: '+e.message); break; }
      }
      return {problems, log, summary:{years:G.car.year-startYear, matches, wins, titleWins, dirty, stories, promos, ovr:ovr(G.w), pop:Math.round(G.car.pop), rooms:sentiment()}};
    }, YEARS);
    if(errs.length) bad(`run ${run} page errors: `+errs.slice(0,3).join(' | '));
    if(result.problems.length){ bad(`run ${run}: ${result.problems.length} problems`); result.problems.slice(0,6).forEach(p=>console.log('       '+JSON.stringify(p))); }
    else ok(`run ${run}: ${JSON.stringify(result.summary)}`);
    result.log.slice(0,12).forEach(l=>console.log('       '+l));
    await page.close();
  }
}

await browser.close();
server.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails?1:0);
