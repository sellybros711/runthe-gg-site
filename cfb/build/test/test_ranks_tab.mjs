/* The Where it ranks tab, in both of its lives.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   (nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
 *   node cfb/build/test/test_ranks_tab.mjs
 *
 * Until launch the tab is a designed placeholder: three dead windows and a
 * sentence saying when they fill in. The wiring behind it is already written
 * and reads window.PS_CFB_RANKS_LIVE, so the second half of this file IS the
 * launch-day test, run against the local PostgREST stand-in: flip the flag,
 * play a season, and the same cells must come back as "#N of M".
 */
import { chromium } from 'playwright';
const SS='/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let bad=0;
const ok=(n,p,x)=>{if(!p)bad++;console.log((p?'  ok   ':' FAIL  ')+n+(x!==undefined?'   '+x:''));};

async function playToResults(page){
  await page.evaluate(()=>document.getElementById('b-play-intro').click());
  await page.waitForTimeout(1400);
  for(let i=0;i<14;i++){
    const t=await page.$('#opts .tile:not(.off)');
    if(!t){await page.waitForTimeout(1300);continue;}
    await t.click();
    await page.waitForTimeout(2500);
    if(await page.$('#s-squad.on')) break;
  }
  await page.evaluate(()=>document.getElementById('b-play').click());
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
async function newPage(live){
  const page=await b.newPage({viewport:{width:600,height:1000}});
  page.on('pageerror',(e)=>{console.log('  PAGE ERROR: '+e.message);bad++;});
  await page.addInitScript(`window.PS_CFB_BOARD_URL='http://localhost:5555';
    ${live?'window.PS_CFB_RANKS_LIVE=true;':''}`);
  await page.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await page.waitForTimeout(2500);
  return page;
}

console.log('\n=== before launch: the placeholder ===');
{
  const p=await newPage(false);
  ok('reached the results screen', await playToResults(p));
  ok('the tab is there', await p.$eval('.overtab[data-t="ranks"]',(el)=>el.textContent==='Where it ranks'));
  await p.click('.overtab[data-t="ranks"]');
  await p.waitForTimeout(300);
  ok('the pane opens', await p.$eval('#op-ranks',(el)=>el.classList.contains('on')));
  const cells=await p.$$eval('#o-ranks .rcell',(els)=>els.map(e=>e.className+' | '+e.textContent));
  ok('three windows, all drawn dead', cells.length===3&&cells.every(c=>/dead/.test(c)&&/at launch/.test(c)));
  ok('labelled Today, This week, All time',
    /Today/.test(cells[0])&&/This week/.test(cells[1])&&/All time/.test(cells[2]));
  const foot=await p.textContent('#o-ranks .rankfoot');
  ok('and it says when they fill in', /switch on at launch/.test(foot), foot.slice(0,60));
  await p.screenshot({path:SS+'ranks_placeholder.png'});
  await p.close();
}

console.log('\n=== launch day: the flag flipped, against the stub board ===');
{
  const p=await newPage(true);
  ok('reached the results screen', await playToResults(p));
  await p.click('.overtab[data-t="ranks"]');
  await p.waitForTimeout(2500);
  const cells=await p.$$eval('#o-ranks .rcell',(els)=>els.map(e=>e.textContent));
  ok('three windows come back', cells.length===3, cells.length+' cells');
  ok('with real placings', cells.every(c=>/#\d/.test(c)&&/of \d/.test(c)), cells.join('  '));
  await p.screenshot({path:SS+'ranks_live.png'});
  await p.close();
}

await b.close();
console.log(bad?('\n'+bad+' FAILURES'):'\nall clear');
process.exit(bad?1:0);
