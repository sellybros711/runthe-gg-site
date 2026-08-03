/* The challenge flow, end to end, with three different people at the table.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/test_challenge.mjs
 *
 * The whole system is stateless links, so the test is three browsers who have
 * never met: the SENDER finishes a season and shares a ?k= link, the FRIEND
 * opens it cold, drafts, plays the Challenge Bowl and shares a ?cr= result
 * link, and a SPECTATOR opens that cold and watches the same game from the
 * sender's side. The one thing that must hold across all three pages is that
 * the Bowl is recomputed from the two rosters alone and lands on the same
 * score every time, which is exactly what the reversed-final assertions pin.
 */
import { chromium } from 'playwright';
const SS='/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const UID='11111111-1111-1111-1111-111111111111';
const stub=(signedIn)=>`
window.supabase={createClient(){const session=${signedIn}?{access_token:'${UID}',user:{id:'${UID}',email:'coach@example.com'}}:null;
return {auth:{onAuthStateChange(){return{data:{}}},getSession:()=>Promise.resolve({data:{session}}),
signInWithPassword:()=>Promise.resolve({error:null}),signUp:()=>Promise.resolve({error:null}),
signInWithOAuth:()=>Promise.resolve({error:null}),signOut:()=>Promise.resolve({})},
from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve({data:${signedIn?"{username:'coachprime'}":'null'}})}}}}}},
rpc:()=>Promise.resolve({data:true,error:null})}}};
Object.defineProperty(navigator,'clipboard',{configurable:true,
  value:{writeText:(t)=>{window.__copied=t;return Promise.resolve();}}});`;

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let bad=0;
const ok=(n,p,x)=>{if(!p)bad++;console.log((p?'  ok   ':' FAIL  ')+n+(x!==undefined?'   '+x:''));};

async function newPage(signedIn){
  const page=await b.newPage({viewport:{width:600,height:1000}});
  page.on('pageerror',(e)=>{console.log('  PAGE ERROR: '+e.message);bad++;});
  await page.addInitScript(stub(signedIn));
  return page;
}
async function draftSix(page){
  await page.waitForTimeout(1400);
  for(let i=0;i<14;i++){
    const t=await page.$('#opts .tile:not(.off)');
    if(!t){await page.waitForTimeout(1300);continue;}
    await t.click();
    await page.waitForTimeout(2500);
    if(await page.$('#s-squad.on')) break;
  }
  return !!(await page.$('#s-squad.on'));
}
async function playSeasonThrough(page){
  await page.evaluate(()=>{const el=document.getElementById('b-play');if(el)el.click();});
  await page.waitForTimeout(1100);
  for(let i=0;i<30;i++){
    if(await page.$('#s-over.on')) break;
    await page.evaluate(()=>{
      for(const id of ['b-sim','b-po-fast','b-po-skip','b-po','b-bowl-fast']){
        const el=document.getElementById(id);
        if(el&&!el.hidden&&el.offsetParent!==null){el.click();return;}
      }
    });
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(4000);
  return !!(await page.$('#s-over.on'));
}
const finalOf=async(page)=>((await page.textContent('#bowl-final'))||'').trim();
const rowShown=async(page,id)=>page.$eval('#'+id,(el)=>!el.hidden).catch(()=>false);

/* ── the sender: play a season, make the dare ─────────────────── */
console.log('\n=== sender builds the link ===');
const A=await newPage(true);
await A.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
await A.waitForTimeout(2500);
await A.evaluate(()=>document.getElementById('b-play-intro').click());
ok('sender drafted six', await draftSix(A));
ok('sender reached the results screen', await playSeasonThrough(A));
const aNames=await A.$$eval('#o-rost .rrow .nm b',(els)=>els.map(e=>e.textContent));
const aOverall=parseFloat(await A.$eval('#o-ovr .v',(el)=>el.textContent));
ok('the challenge button is on the results screen',
  await A.$eval('#b-challenge',(el)=>el.offsetParent!==null&&/Challenge a friend/i.test(el.textContent)));
await A.screenshot({path:SS+'ch_a_results.png'});
await A.click('#b-challenge');
await A.waitForTimeout(1800);
const aCopied=await A.evaluate(()=>window.__copied||'');
ok('sharing fell back to a copied link', aCopied.includes('runthe.gg/cfb/c/?k='));
ok('the text is a dare', /beat my score/.test(aCopied)&&/Do you have what it takes\?/.test(aCopied));
ok('the record is in the dare', /I went \d+-\d+/.test(aCopied), aCopied.split('\n')[0]);
const kParam=(aCopied.match(/\?k=([^\s]+)/)||[])[1];
ok('the packed link is compact', !!kParam&&kParam.length<75, kParam&&(kParam.length+' chars'));

/* ── the friend: open it cold, draft, play the Bowl ───────────── */
console.log('\n=== friend accepts ===');
const B=await newPage(false);
await B.goto('http://localhost:8080/cfb/index.html?k='+kParam,{waitUntil:'domcontentloaded',timeout:40000});
await B.waitForTimeout(2500);
ok('the accept screen takes over', !!(await B.$('#s-challenge.on')));
ok('named after the sender', (await B.textContent('#ch-title')).includes('coachprime'));
ok('mode is shown', /Free play|draft/.test(await B.textContent('#ch-mode')), await B.textContent('#ch-mode'));
const bSeen=await B.$$eval('#ch-rost .rrow .nm b',(els)=>els.map(e=>e.textContent));
ok('all six of the sender\'s players survive the trip', bSeen.length===6&&bSeen.join('|')===aNames.join('|'));
const chRating=parseFloat(await B.textContent('#ch-rating'));
ok('their team overall matches the sender\'s screen', Math.abs(chRating-aOverall)<=0.2, chRating+' vs '+aOverall);
await B.screenshot({path:SS+'ch_b_accept.png'});
await B.click('#b-ch-draft');
ok('friend drafted six', await draftSix(B));
ok('the play button knows where this is going',
  (await B.textContent('#b-play')).trim()==='Play the Challenge Bowl');
await B.evaluate(()=>document.getElementById('b-play').click());
await B.waitForTimeout(1600);
ok('the Bowl broadcast opens', !!(await B.$('#s-bowl.on')));
ok('with the challenge header', await B.$eval('#bowl-chhead',(el)=>!el.hidden));
ok('titled as a head to head', /Your team vs coachprime/.test(await B.textContent('#bowl-title')));
await B.click('#b-bowl-fast');
await B.waitForTimeout(900);
ok('the result panel lands', await rowShown(B,'bowl-result'));
const bFinal=await finalOf(B);
ok('a football score', /^\d+-\d+$/.test(bFinal), bFinal);
const bWon=/YOU WIN/.test(await B.textContent('#bowl-outcome'));
ok('player rows: season, new run and share are offered',
  (await rowShown(B,'bw-season'))&&(await rowShown(B,'bw-new'))&&(await rowShown(B,'bw-share')));
ok('but not the spectator CTA', !(await rowShown(B,'bw-play')));
await B.screenshot({path:SS+'ch_b_result.png'});
await B.click('#b-bowl-share');
await B.waitForTimeout(900);
const bCopied=await B.evaluate(()=>window.__copied||'');
ok('the result link is copied', bCopied.includes('?cr='));
const crParam=(bCopied.match(/\?cr=([^\s]+)/)||[])[1];
await B.click('#b-bowl-season');
await B.waitForTimeout(1400);
ok('and the same roster rolls into a real season', !!(await B.$('#s-season.on')));

/* ── the spectator: the same game from the sender's side ──────── */
console.log('\n=== spectator watches ===');
const C=await newPage(false);
await C.goto('http://localhost:8080/cfb/index.html?cr='+crParam,{waitUntil:'domcontentloaded',timeout:40000});
await C.waitForTimeout(2500);
ok('the result link opens straight into the Bowl', !!(await C.$('#s-bowl.on')));
await C.click('#b-bowl-fast');
await C.waitForTimeout(900);
const cFinal=await finalOf(C);
const rev=bFinal.split('-').reverse().join('-');
ok('the same game, seen from the sender', cFinal===rev, cFinal+' vs reversed '+bFinal);
const cWon=/YOU WIN/.test(await C.textContent('#bowl-outcome'));
ok('and the verdict flips with the seat', cWon===!bWon);
ok('spectator rows: only the draft CTA and home',
  (await rowShown(C,'bw-play'))&&!(await rowShown(C,'bw-season'))&&!(await rowShown(C,'bw-share')));
await C.screenshot({path:SS+'ch_c_view.png'});

/* Same link, second stranger, same score: the Bowl is a pure function. */
const D=await newPage(false);
await D.goto('http://localhost:8080/cfb/index.html?cr='+crParam,{waitUntil:'domcontentloaded',timeout:40000});
await D.waitForTimeout(2500);
await D.click('#b-bowl-fast');
await D.waitForTimeout(900);
ok('a second viewer sees the identical final', (await finalOf(D))===cFinal);

/* ── garbage in the URL must not wedge the page ───────────────── */
console.log('\n=== bad links degrade ===');
const G=await newPage(false);
await G.goto('http://localhost:8080/cfb/index.html?k=zzzz',{waitUntil:'domcontentloaded',timeout:40000});
await G.waitForTimeout(2500);
ok('a mangled ?k= just opens the game', !!(await G.$('#s-intro.on')));
await G.goto('http://localhost:8080/cfb/index.html?cr=%%%',{waitUntil:'domcontentloaded',timeout:40000});
await G.waitForTimeout(2500);
ok('a mangled ?cr= just opens the game', !!(await G.$('#s-intro.on')));

await b.close();
console.log(bad?('\n'+bad+' FAILURES'):'\nall clear');
process.exit(bad?1:0);
