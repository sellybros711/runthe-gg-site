/* The Where it ranks tab, in all three of its lives.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   (nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
 *   node cfb/build/test/test_ranks_tab.mjs
 *
 * The tab decides for itself which life it is in, by asking the board. Three
 * cases, and the middle one is the one that matters:
 *
 *   pinned off        window.PS_CFB_RANKS_LIVE=false, the designed placeholder
 *   table not there   nothing pinned, and the server 404s cfb_runs. This is
 *                     the real pre-launch state, and it has to reach the SAME
 *                     placeholder rather than "could not be read", because
 *                     "not open yet" and "did not answer" are different facts
 *   board answering   nothing pinned, the local PostgREST stand-in behind it,
 *                     and the cells must come back as "#N of M" with no flag
 *                     flipped and nothing deployed
 *
 * The third case is the launch: it proves the tab goes live off the migration
 * alone.
 */
import { chromium } from 'playwright';
import http from 'node:http';
const SS='/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let bad=0;
const ok=(n,p,x)=>{if(!p)bad++;console.log((p?'  ok   ':' FAIL  ')+n+(x!==undefined?'   '+x:''));};

async function playToResults(page){
  await page.evaluate(()=>document.getElementById('b-play-intro').click());
  await page.waitForTimeout(1400);
  for(let i=0;i<20;i++){
    /* A DUAL-POSITION PLAYER STOPS THE DRAFT AND ASKS. Taking one opens the slot
       sheet over the wheel, and the sheet swallows every click until it is
       answered, so a loop that only knows about tiles sits there retrying until
       the whole suite times out. It is not rare and it is not deterministic:
       which players the wheel offers depends on the run, which is why this used
       to look like a flake. Answer it with the first slot and carry on. */
    const slot=await page.$('#sheet.on .slotopt');
    if(slot){await slot.click();await page.waitForTimeout(900);continue;}
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
/* A server that answers every board call the way a Supabase project answers before
   the migration has been run: PostgREST's own 404 body, naming the missing table.
   That body is what sets needsMigration, so this is the pre-launch server. */
const noTable=http.createServer((req,res)=>{
  /* CORS answered properly, because that is what the real project does: the
     gateway allows the call and PostgREST behind it is the thing that 404s. A
     stub that failed the preflight instead would test a network error, which is
     the other case entirely and the one this must not be confused with. */
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*',
    'Access-Control-Expose-Headers':'content-range'};
  if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}
  res.writeHead(404,Object.assign({'Content-Type':'application/json'},cors));
  res.end(JSON.stringify({code:'PGRST205',details:null,
    hint:"Perhaps you meant the table 'public.ps_runs'",
    message:"Could not find the table 'public.cfb_runs' in the schema cache"}));
});
await new Promise((r)=>noTable.listen(5556,r));

/* live: true pins on, false pins off, null leaves it to work itself out. */
async function newPage(live,port){
  const page=await b.newPage({viewport:{width:600,height:1000}});
  page.on('pageerror',(e)=>{console.log('  PAGE ERROR: '+e.message);bad++;});
  await page.addInitScript(`window.PS_CFB_BOARD_URL='http://localhost:${port||5555}';
    ${live===null?'':'window.PS_CFB_RANKS_LIVE='+(live?'true':'false')+';'}`);
  await page.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await page.waitForTimeout(2500);
  return page;
}

async function expectPlaceholder(p,what){
  const cells=await p.$$eval('#o-ranks .rcell',(els)=>els.map(e=>e.className+' | '+e.textContent));
  ok(what+': three windows, all drawn dead',
    cells.length===3&&cells.every(c=>/dead/.test(c)&&/at launch/.test(c)), cells.join('  '));
  ok(what+': labelled Today, This week, All time',
    /Today/.test(cells[0]||'')&&/This week/.test(cells[1]||'')&&/All time/.test(cells[2]||''));
  const foot=await p.textContent('#o-ranks .rankfoot');
  ok(what+': and it says when they fill in', /switch on at launch/.test(foot), foot.slice(0,60));
}

console.log('\n=== pinned off: the designed placeholder ===');
{
  const p=await newPage(false);
  ok('reached the results screen', await playToResults(p));
  ok('the tab is there', await p.$eval('.overtab[data-t="ranks"]',(el)=>el.textContent==='Where it ranks'));
  await p.click('.overtab[data-t="ranks"]');
  await p.waitForTimeout(300);
  ok('the pane opens', await p.$eval('#op-ranks',(el)=>el.classList.contains('on')));
  await expectPlaceholder(p,'pinned off');
  await p.screenshot({path:SS+'ranks_placeholder.png'});
  await p.close();
}

console.log('\n=== nothing pinned, table not there: the same placeholder ===');
{
  const p=await newPage(null,5556);
  ok('reached the results screen', await playToResults(p));
  await p.click('.overtab[data-t="ranks"]');
  await p.waitForTimeout(2500);
  await expectPlaceholder(p,'no table');
  ok('and the place line says the board opens at launch',
    /opens at launch/.test(await p.textContent('#o-place')||''),
    (await p.textContent('#o-place')||'').slice(0,70));
  await p.screenshot({path:SS+'ranks_no_table.png'});
  await p.close();
}

console.log('\n=== nothing pinned, the board answering: live with no flag flipped ===');
{
  const p=await newPage(null);
  ok('reached the results screen', await playToResults(p));
  await p.click('.overtab[data-t="ranks"]');
  await p.waitForTimeout(2500);
  const cells=await p.$$eval('#o-ranks .rcell',(els)=>els.map(e=>e.textContent));
  ok('three windows come back', cells.length===3, cells.length+' cells');
  ok('with real placings', cells.every(c=>/#\d/.test(c)&&/of \d/.test(c)), cells.join('  '));
  await p.screenshot({path:SS+'ranks_live.png'});
  await p.close();
}

noTable.close();
await b.close();
console.log(bad?('\n'+bad+' FAILURES'):'\nall clear');
process.exit(bad?1:0);
