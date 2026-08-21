/* What an account is for, and what a guest gets instead.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   (nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
 *   node cfb/build/test/test_gates.mjs
 *
 * School colors, the trophy case and the badges are signed-in features, and the profile
 * sheet is where all three live. THE ROUTE CHANGED and this file was left pointing at the
 * old one: the sheet used to be two tabs the guest could flip between, and it is a hub of
 * nav rows now that only opens for an account with a name on it. So a guest does not see a
 * locked colour picker any more, they see the sign-in form, which is the honest version of
 * the same thing and one screen shorter.
 *
 * THE ONE THAT MATTERS MOST IS THE SECOND BLOCK. A guest used to finish a season and get
 * "Achievement: ..." banners over the results screen, off a trophy case kept in that one
 * browser's storage. That is a prize that vanishes when the cache is cleared and never
 * follows them to a phone, so it is worse than no prize. The season is still written down,
 * because signing in later has to derive the whole case from seasons already played, and
 * nothing is announced. Only a test can tell those two apart: both look like silence.
 *
 * Also covers two bugs found while writing the original:
 *   the saved school must survive a sign-out rather than being forgotten, and
 *   a signed-in trophy case must not spin forever when the board cannot answer.
 *
 * THE BUTTON IN THE HEADER has all three of its states here, because it is the one
 * control on every screen of the game and the three are one class swap apart: the pill
 * that says Sign in, the bubble with your initials, and the plain head for the case
 * where nobody has answered yet or the script never landed at all.
 *
 * The offline case is otherwise not here: the gate a guest can actually reach is the
 * More ways to play sheet, and test_gate_modes.mjs walks all three of its states.
 */
import { chromium } from 'playwright';
const SS='/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const UID='11111111-1111-1111-1111-111111111111';
const stub=(signedIn,named)=>`
window.supabase={createClient(){const session=${signedIn}?{access_token:'${UID}',user:{id:'${UID}',email:'coach@example.com'}}:null;
return {auth:{onAuthStateChange(){return{data:{}}},getSession:()=>Promise.resolve({data:{session}}),
signInWithPassword:()=>Promise.resolve({error:null}),signUp:()=>Promise.resolve({error:null}),
signInWithOAuth:()=>Promise.resolve({error:null}),signOut:()=>Promise.resolve({})},
from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve({data:${signedIn&&named!==false?"{username:'coachprime'}":'null'}})}}}}}},
rpc:()=>Promise.resolve({data:true,error:null})}}};
window.PS_CFB_BOARD_URL='http://localhost:5555';`;
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

let bad=0;
const ok=(n,p,x)=>{if(!p)bad++;console.log((p?'  ok   ':' FAIL  ')+n+(x?'   '+x:''));};

/* One season, start to finish, the way a player plays it. Returns at the results screen.
 *
 * `worst` DRAFTS THE CHEAPEST MAN OFFERED EVERY ROUND, and the guest blocks below need
 * it. A guest who makes the playoff is stopped at the seeding screen now and asked for
 * an account, which is the whole of test_playoff_gate.mjs, so a strong draft here would
 * hang against a wall that is working correctly. A minimum roster reaches neither the
 * playoff nor a bowl in sixty seasons, so the season ends at seeding and this file gets
 * on with what it is actually about: what a finished season announces, and to whom. */
async function playSeason(p,worst){
  await p.evaluate(()=>document.getElementById('b-play-intro').click());
  await p.waitForTimeout(1400);
  for(let i=0;i<40;i++){
    if(await p.$('#s-squad.on')) break;
    /* A pick that can fill more than one slot opens the chooser over the board, and a
       tile click while that sheet is up lands on the sheet. Answer it first. */
    const slot=await p.$('#sheet.on .slotopt[data-i]');
    if(slot){ await slot.click(); await p.waitForTimeout(800); continue; }
    const took=await p.evaluate((low)=>{
      const t=[...document.querySelectorAll('#opts .tile:not(.off)')];
      if(!t.length) return false;
      const fppg=(e)=>parseFloat((e.querySelector('.pts b')||{}).textContent||'0')||0;
      if(low) t.sort((a,b)=>fppg(a)-fppg(b));
      t[0].click(); return true;
    },!!worst);
    await p.waitForTimeout(took?2200:600);
  }
  /* The post-draft ask stands over the squad screen for a guest. Dismissed the way a
     player dismisses it, so the clicks below land on the game and not on the sheet. */
  const x=await p.$('#gp-x'); if(x){ await x.click(); await p.waitForTimeout(500); }
  await p.evaluate(()=>{const x=document.getElementById('b-play');if(x)x.click();});
  await p.waitForTimeout(1100);
  for(let i=0;i<30;i++){if(await p.$('#s-over.on'))break;
    await p.evaluate(()=>{for(const id of ['b-sim','b-po-fast','b-po-skip','b-po','b-bowl-fast']){
      const x=document.getElementById(id);if(x&&!x.hidden&&x.offsetParent!==null){x.click();return;}}});
    await p.waitForTimeout(1200);}
}

console.log('\n=== a guest opens the profile ===');
{
  const p=await b.newPage({viewport:{width:600,height:1000}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(stub(false));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2800);
  /* THE BUTTON IN THE CORNER SAYS SO IN WORDS. A line-art head in a circle is the
     convention for "your account" and says nothing to somebody who has not got one:
     it reads as decoration, and it is the one control on every screen of the game. */
  ok('the header button is a Sign in pill',
    await p.$eval('#b-profile',e=>e.classList.contains('signin')));
  ok('and it says Sign in', /sign in/i.test(await p.$eval('#b-profile',e=>e.textContent||'')),
    (await p.$eval('#b-profile',e=>(e.textContent||'').trim())));
  ok('the head is not drawn behind the word',
    await p.$eval('#b-profile svg',e=>getComputedStyle(e).display==='none'));
  await p.click('#b-profile'); await p.waitForTimeout(600);
  ok('it opens on the sign-in form', !!(await p.$('#ac-email')));
  ok('and not on a hub, because there is no account to be the hub of',
    !(await p.$('#pf-go-case')));
  ok('no school is selectable', (await p.$$eval('.swatch',e=>e.length))===0);
  ok('the page is not themed', !(await p.evaluate(()=>document.body.classList.contains('themed'))));
  /* Nothing to delete, and offering it would be offering to end something that is
     not there yet. */
  ok('and there is nothing to delete', !(await p.$('#a-del')));
  await p.screenshot({path:SS+'gate_guest_profile.png'});
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== a guest finishes a season ===');
{
  const p=await b.newPage({viewport:{width:600,height:1100}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(stub(false));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2800);
  /* Every headline the page raises from the moment the season ends, not a single reading
     of it: the banner shows for 2.4s and clears itself, so a poll at the wrong moment
     would call a run of three "no badges announced". */
  await p.evaluate(()=>{
    window.__heads=[];
    const el=document.getElementById('headline');
    new MutationObserver(()=>{ if(el.classList.contains('on')) window.__heads.push(el.textContent||''); })
      .observe(el,{attributes:true,childList:true,characterData:true,subtree:true});
  });
  await playSeason(p,true);
  await p.waitForTimeout(9000);   // past achAnnounce's 900ms + 2100ms spacing for three
  const heads=await p.evaluate(()=>window.__heads||[]);
  ok('the season finished', !!(await p.$('#s-over.on')));
  ok('and NOT ONE badge was announced', !heads.some(t=>/achievement/i.test(t)),
    heads.join(' | ')||'nothing raised');
  /* The other half of the rule. Losing the season as well would mean an account earned
     nothing for the seasons played before it. */
  const hist=await p.evaluate(()=>{try{return JSON.parse(localStorage.getItem('cfb_history')||'[]').length}catch(e){return -1}});
  ok('but the season itself is written down', hist===1, hist+' rows');
  await p.screenshot({path:SS+'gate_guest_results.png'});
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== a member finishes a season ===');
{
  const p=await b.newPage({viewport:{width:600,height:1100}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(stub(true));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2800);
  /* A cabinet that has been looked at once already, because the FIRST sighting is
     recorded silently on purpose and would otherwise read exactly like the guest case. */
  await p.evaluate((uid)=>localStorage.setItem('cfb_ach_seen',
    JSON.stringify({[uid]:['__nothing_real__']})),UID);
  await p.evaluate(()=>{
    window.__heads=[];
    const el=document.getElementById('headline');
    new MutationObserver(()=>{ if(el.classList.contains('on')) window.__heads.push(el.textContent||''); })
      .observe(el,{attributes:true,childList:true,characterData:true,subtree:true});
  });
  await playSeason(p);
  await p.waitForTimeout(9000);
  const heads=await p.evaluate(()=>window.__heads||[]);
  ok('the season finished', !!(await p.$('#s-over.on')));
  ok('and the badges it earned are announced', heads.some(t=>/achievement/i.test(t)),
    heads.join(' | ')||'nothing raised');
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== a member opens the profile ===');
{
  const p=await b.newPage({viewport:{width:600,height:1000}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(stub(true));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2800);
  ok('the header button is the bubble again, not a pill',
    !(await p.$eval('#b-profile',e=>e.classList.contains('signin'))));
  await p.click('#b-profile'); await p.waitForTimeout(600);
  ok('it opens on the hub', !!(await p.$('#pf-go-case')));
  await p.click('#pf-go-look'); await p.waitForTimeout(600);
  const n=await p.$$eval('.swatch',e=>e.length);
  ok('every school is selectable', n>80, n+' schools');
  ok('and there is no gate', (await p.$$eval('.gate',e=>e.length))===0);
  /* The swatches sit inside collapsed <details>, so open the one holding it first. */
  await p.evaluate(()=>{const b=document.querySelector('.swatch[data-school="Alabama"]');
    b.closest('details').open=true;});
  await p.waitForTimeout(300);
  await p.click('.swatch[data-school="Alabama"]'); await p.waitForTimeout(700);
  /* A TAP IS A PENDING CHOICE AND NOT A SAVE any more: school and initials are one
     object stored in one round trip, so the pick marks the swatch and Save writes it.
     That the write then paints the page is the last block's job, from the other end:
     a school already stored comes back themed on its own. */
  ok('picking one marks it', !!(await p.$('.swatch.on[data-school="Alabama"]')));
  ok('and the preview follows it', /alabama/i.test(await p.textContent('#pfp-team')),
    await p.textContent('#pfp-team'));
  ok('with a save button to write it', !!(await p.$('#a-savepfp')));
  await p.screenshot({path:SS+'gate_signedin_picker.png'});
  await p.evaluate(()=>document.getElementById('pf-back').click()); await p.waitForTimeout(600);
  await p.click('#pf-go-case'); await p.waitForTimeout(6000);
  const ct=(await p.textContent('#sheet-in')).replace(/\s+/g,' ');
  ok('the full case is shown', /Milestones/.test(ct), ct.slice(0,90));
  ok('with nothing blurred', (await p.$$eval('.ach.blur',e=>e.length))===0);
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== the school you picked, and who owns it ===');
{
  /* THE ACCOUNT OWNS IT, not this browser: migration 66 moved the school onto the
     account so it survives a cleared cache and reaches a second device. The local copy
     is a fast first paint and nothing more, so when the two disagree the account wins,
     INCLUDING WHEN THE ACCOUNT SAYS NONE. That last part is the one that looks like a
     bug from the outside and is the whole point: a school this browser remembers, that
     the account has never heard of, is somebody else's pick or a stale one. */
  const p=await b.newPage({viewport:{width:600,height:1000}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  /* A school in this browser's storage from an earlier session. */
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
  await q.waitForTimeout(3200);
  ok('signed in, the account is asked and it has no school on it',
    !(await q.evaluate(()=>document.body.classList.contains('themed'))));
  ok('so the browser copy does not paint over the answer',
    !(await q.evaluate(()=>/gradient/i.test(getComputedStyle(document.documentElement).getPropertyValue('--pfp')))));
  ok('and the bubble is still the account, initials and all',
    (await q.$eval('#b-profile .ab',e=>e.textContent))==='CO',
    await q.$eval('#b-profile .ab',e=>e.textContent));
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
  await p.click('#b-profile'); await p.waitForTimeout(600);
  await p.click('#pf-go-case'); await p.waitForTimeout(6000);
  const t=(await p.textContent('#sheet-in')).replace(/\s+/g,' ');
  ok('the case does not spin forever', !/Fetching your seasons/.test(t), t.slice(0,80));
  ok('it says the fetch failed and nothing is lost', /could not be fetched/.test(t)||/No seasons yet/.test(t));
  await p.screenshot({path:SS+'gate_case_boarddown.png'});
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== the sign-in script never landed ===');
{
  /* THE THIRD STATE OF THE HEADER BUTTON, and the reason it is not simply "not signed
     in". The library is given fifteen seconds to turn up and then declared absent, which
     in the wild is an ad blocker. Telling somebody to sign in when their browser is
     refusing to load the thing that would let them is worse than saying nothing, and the
     same rule covers the half second before a returning player's session restores. */
  const p=await b.newPage({viewport:{width:600,height:1000}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(3000);
  ok('early on it is still the plain head, not an invitation',
    !(await p.$eval('#b-profile',e=>e.classList.contains('signin'))));
  await p.waitForTimeout(15000);      // past auth.js's GIVE_UP_MS
  ok('and it stays the plain head once accounts are declared offline',
    !(await p.$eval('#b-profile',e=>e.classList.contains('signin'))));
  ok('the head is drawn', await p.$eval('#b-profile svg',e=>getComputedStyle(e).display!=='none'));
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

await b.close();
console.log(bad?'\nFAILURES: '+bad:'\nall clear');
process.exit(bad?1:0);
