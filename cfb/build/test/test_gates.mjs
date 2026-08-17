/* What an account is for, and what happens without one.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   (nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
 *   node cfb/build/test/test_gates.mjs
 *
 * School colours and the full trophy case are signed-in features. That is three
 * states and not two, and the third is the one worth testing: signed in, signed
 * out, and accounts not available at all because the sign-in library was blocked.
 * Telling somebody with an ad blocker to sign in is advice they cannot take.
 *
 * Also covers two bugs found while writing it:
 *   the saved school must survive a sign-out rather than being forgotten, and
 *   a signed-in trophy case must not spin forever when the board cannot answer.
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
window.PS_CFB_BOARD_URL='http://localhost:5555';`;
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

let bad=0;
const ok=(n,p,x)=>{if(!p)bad++;console.log((p?'  ok   ':' FAIL  ')+n+(x?'   '+x:''));};

console.log('\n=== signed out ===');
{
  const p=await b.newPage({viewport:{width:600,height:1000}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(stub(false));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2800);
  await p.click('#b-profile'); await p.waitForTimeout(500);
  await p.click('.achtabs button[data-tab="school"]'); await p.waitForTimeout(500);
  ok('no school is selectable', (await p.$$eval('.swatch',e=>e.length))===0);
  ok('a colour peek is shown instead', (await p.$$eval('.peekdot',e=>e.length))>0,
    (await p.$$eval('.peekdot',e=>e.length))+' dots');
  ok('with a gate that asks for an account', /come with an account/.test(await p.textContent('.gate')), await p.textContent('.gate'));
  await p.screenshot({path:SS+'gate_colors.png'});
  ok('the page is not themed', !(await p.evaluate(()=>document.body.classList.contains('themed'))));

  await p.click('.achtabs button[data-tab="case"]'); await p.waitForTimeout(600);
  const t=(await p.textContent('#sheet-in')).replace(/\s+/g,' ');
  ok('the case is a peek, not the full shelves', !/Milestones/.test(t));
  ok('and says how many badges there are', /\d+ badges in here|Still out there/.test(t));
  await p.screenshot({path:SS+'gate_case_empty.png'});

  // the gate button goes to the account tab
  await p.click('#gate-in'); await p.waitForTimeout(500);
  ok('the gate button opens the account tab', !!(await p.$('#ac-email')));
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== signed out, after playing a season ===');
{
  const p=await b.newPage({viewport:{width:600,height:1100}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(stub(false));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2800);
  await p.evaluate(()=>document.getElementById('b-play-intro').click());
  await p.waitForTimeout(1400);
  for(let i=0;i<12;i++){const t=await p.$('#opts .tile:not(.off)');if(!t){await p.waitForTimeout(1300);continue;}
    await t.click();await p.waitForTimeout(2500);if(await p.$('#s-squad.on'))break;}
  await p.evaluate(()=>{const x=document.getElementById('b-play');if(x)x.click();});
  await p.waitForTimeout(1100);
  for(let i=0;i<30;i++){if(await p.$('#s-over.on'))break;
    await p.evaluate(()=>{for(const id of ['b-sim','b-po-fast','b-po-skip','b-po','b-bowl-fast']){
      const x=document.getElementById(id);if(x&&!x.hidden&&x.offsetParent!==null){x.click();return;}}});
    await p.waitForTimeout(1200);}
  await p.waitForTimeout(4000);
  await p.click('#b-profile'); await p.waitForTimeout(500);
  await p.click('.achtabs button[data-tab="case"]'); await p.waitForTimeout(700);
  const t=(await p.textContent('#sheet-in')).replace(/\s+/g,' ');
  ok('what was earned is shown in full', /Earned \d+ of \d+/.test(t), (t.match(/Earned \d+ of \d+/)||[''])[0]);
  ok('the career line is there too', /seasons/.test(t));
  ok('and the rest is blurred', (await p.$$eval('.ach.blur',e=>e.length))>0,
    (await p.$$eval('.ach.blur',e=>e.length))+' blurred');
  await p.screenshot({path:SS+'gate_case_played.png'});
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== signed in ===');
{
  const p=await b.newPage({viewport:{width:600,height:1000}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(stub(true));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2800);
  await p.click('#b-profile'); await p.waitForTimeout(500);
  await p.click('.achtabs button[data-tab="school"]'); await p.waitForTimeout(600);
  const n=await p.$$eval('.swatch',e=>e.length);
  ok('every school is selectable', n>80, n+' schools');
  ok('and there is no gate', (await p.$$eval('.gate',e=>e.length))===0);
  /* The swatches sit inside collapsed <details>, so open the one holding it first. */
  await p.evaluate(()=>{const b=document.querySelector('.swatch[data-school="Alabama"]');
    b.closest('details').open=true;});
  await p.waitForTimeout(300);
  await p.click('.swatch[data-school="Alabama"]'); await p.waitForTimeout(700);
  ok('picking one themes the page', await p.evaluate(()=>document.body.classList.contains('themed')));
  ok('and the bubble shows your initials in the school colors',
    (await p.$eval('#b-profile .ab',e=>e.textContent))==='C'
    && (await p.evaluate(()=>/gradient/i.test(getComputedStyle(document.documentElement).getPropertyValue('--pfp')))));
  await p.screenshot({path:SS+'gate_signedin_themed.png'});
  await p.click('#b-profile'); await p.waitForTimeout(500);
  await p.click('.achtabs button[data-tab="case"]'); await p.waitForTimeout(6000);
  const ct=(await p.textContent('#sheet-in')).replace(/\s+/g,' ');
  ok('the full case is shown', /Milestones/.test(ct), ct.slice(0,90));
  ok('with nothing blurred', (await p.$$eval('.ach.blur',e=>e.length))===0);
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== accounts blocked entirely ===');
{
  const p=await b.newPage({viewport:{width:600,height:1000}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript("window.PS_CFB_BOARD_URL='http://localhost:5555';");  // no supabase at all
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2800);
  await p.click('#b-profile'); await p.waitForTimeout(400);
  await p.click('.achtabs button[data-tab="school"]'); await p.waitForTimeout(400);
  ok('while the library might still arrive it says checking',
    /Checking your account/.test(await p.textContent('.gate')), await p.textContent('.gate'));
  await p.waitForTimeout(16000);
  await p.click('.achtabs button[data-tab="school"]'); await p.waitForTimeout(400);
  ok('once it has given up it says accounts are offline',
    /Accounts are offline/.test(await p.textContent('.gate')));
  ok('and does not tell you to sign in', !/Sign in or create/.test(await p.textContent('.gate')));
  await p.screenshot({path:SS+'gate_blocked.png'});
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}
console.log('\n=== a saved school survives a sign-out and comes back ===');
{
  const p=await b.newPage({viewport:{width:600,height:1000}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  /* A school already saved from an earlier signed-in session. */
  await p.addInitScript(stub(false)+`
    localStorage.setItem('cfb_school', JSON.stringify(
      {school:'Alabama',abbr:'ALA',color:'#9E1B32',alt:'#828A8F'}));`);
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2800);
  ok('signed out, the saved school is NOT painted',
    !(await p.evaluate(()=>document.body.classList.contains('themed'))));
  ok('and the bubble does not show it',
    (await p.$eval('#b-profile .ab',e=>e.textContent))==='');
  ok('but it is still remembered',
    !!(await p.evaluate(()=>localStorage.getItem('cfb_school'))));
  await p.close();

  const q=await b.newPage({viewport:{width:600,height:1000}});
  q.on('pageerror',e=>errs.push(e.message));
  await q.addInitScript(stub(true)+`
    localStorage.setItem('cfb_school', JSON.stringify(
      {school:'Alabama',abbr:'ALA',color:'#9E1B32',alt:'#828A8F'}));`);
  await q.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await q.waitForTimeout(2800);
  ok('signed in, it comes back on its own',
    await q.evaluate(()=>document.body.classList.contains('themed')));
  ok('and the bubble shows your initials in the school colors again',
    (await q.$eval('#b-profile .ab',e=>e.textContent))==='C'
    && (await q.evaluate(()=>/gradient/i.test(getComputedStyle(document.documentElement).getPropertyValue('--pfp')))));
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await q.close();
}

console.log('\n=== signed in, but the board cannot answer ===');
{
  const p=await b.newPage({viewport:{width:600,height:1000}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(stub(true).replace('http://localhost:5555','http://localhost:5999'));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2800);
  await p.click('#b-profile'); await p.waitForTimeout(500);
  await p.click('.achtabs button[data-tab="case"]'); await p.waitForTimeout(6000);
  const t=(await p.textContent('#sheet-in')).replace(/\s+/g,' ');
  ok('the case does not spin forever', !/Fetching your seasons/.test(t), t.slice(0,80));
  ok('it says the fetch failed and nothing is lost', /could not be fetched/.test(t)||/No seasons yet/.test(t));
  await p.screenshot({path:SS+'gate_case_boarddown.png'});
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

await b.close();
console.log(bad?'\nFAILURES: '+bad:'\nall clear');
process.exit(bad?1:0);
