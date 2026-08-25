/* THE MODE, ON A PHONE, WITH A TESTER SIGNED IN.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_page.mjs
 *
 * Stage 1 is done when one decision plays on a phone and the room answers. This plays
 * several, through a whole season and out the other side, and checks the things that are
 * only true on a screen:
 *
 *   the door holds. A signed-out visitor and a signed-in stranger both get nothing.
 *   a ruling really reaches the ledger, so the sport on screen is the sport in the save
 *   testing a policy changes NOTHING, which is the one thing a preview must never do
 *   the paid settings are drawn for a free player and are dead, because a control you can
 *     see and cannot turn is the clearest a paywall ever gets
 *   a term survives the browser being closed
 *
 * THE TESTER LIST IS EMPTY IN THE REPO and only real accounts ever go in it, so this test
 * puts its own name on the list rather than asserting against somebody's real account. It
 * does that through the same array the page reads, not by patching the page: access.js
 * assigns window.PS_CFB_COMMISH_ACCESS, and `arm` traps that assignment and pushes a name.
 * The gate the test passes through is therefore the real gate.
 *
 * The earlier version signed in AS a named tester, which tied a green test run to one
 * person's leaderboard name. That broke the moment the list changed, and it would have
 * gone on passing if the list were emptied by mistake.
 */
import { chromium } from 'playwright';
const SS='/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const UID='11111111-1111-1111-1111-111111111111';
const URL='http://localhost:8080/cfb/commish/index.html';

/* The account, with the username the page's tester list is written against. */
const stub=(signedIn,username)=>`
window.supabase={createClient(){
  const session=${signedIn}?{access_token:'x',user:{id:'${UID}',email:'c@e.com'}}:null;
  return {auth:{onAuthStateChange(){return{data:{}}},
    getSession:()=>Promise.resolve({data:{session}}),
    signInWithPassword:()=>Promise.resolve({error:null}),
    signUp:()=>Promise.resolve({error:null}),
    signInWithOAuth:()=>Promise.resolve({error:null}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:${username?"{username:'"+username+"'}":'null'}})}}}}}},
    rpc:()=>Promise.resolve({data:true,error:null})}}};`;

/* PUT A NAME ON THE REAL LIST, by trapping the assignment access.js makes. Deterministic:
   the name is added the instant the file defines the object, which is before any page code
   asks the question. Nothing in the shipped list changes, and no production code has a
   hook in it for the benefit of a test. */
const TESTER='commish-test-account';
const arm=(name)=>`
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify(name)}); }catch(e){} }});
})();`;
/* Signed in as that account, and on the list. */
const tester=()=>arm(TESTER)+stub(true,TESTER);

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
/* THE SIMULATION SITS BETWEEN THE OFFICE AND THE DESK NOW. Pressing on walks the days of the
   beat before anything lands, which is the point of it and which every walker in these tests
   would otherwise sit through or, worse, time out on. Tapping it skips to the end. */
async function skipSim(pg) {
  for (let i = 0; i < 60; i++) {
    const up = await pg.$eval('#s-sim', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) return;
    await pg.click('#s-sim', { timeout: 1500 }).catch(() => {});
    await pg.waitForTimeout(110);
  }
}

let bad=0;
const ok=(n,p,x)=>{if(!p)bad++;console.log((p?'  ok   ':' FAIL  ')+n+(x!==undefined?'   '+x:''));};
const open=async(init,w)=>{
  const p=await b.newPage({viewport:{width:w||390,height:900}});
  const errs=[]; p.on('pageerror',(e)=>errs.push(e.message));
  await p.addInitScript(init);
  await p.goto(URL,{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2600);
  return {p,errs};
};
const on=(p,id)=>p.$eval('#'+id,(e)=>e.classList.contains('on')).catch(()=>false);
/* A CLICK ON A BUTTON THAT IS NOT READY BLOCKS FOR THIRTY SECONDS, which in a loop over
   twenty-four beats is a test that looks hung rather than a test that failed. Give it two
   seconds and report false, so a loop can decide what to do instead of waiting. */
const tap=async(p,sel)=>{ try{ await p.click(sel,{timeout:2000}); return true; }catch(e){ return false; } };
const txt=(p,sel)=>p.$eval(sel,(e)=>(e.textContent||'').replace(/\s+/g,' ').trim()).catch(()=>'');

console.log('\n=== the door ===');
{
  const {p,errs}=await open(stub(false,null));
  ok('signed out, the mode does not open', await on(p,'s-gate'));
  ok('  and it says why', /in testing/i.test(await txt(p,'#gate-say')), await txt(p,'#gate-say'));
  ok('  with a way back to the game', !!(await p.$('#gate-act a[href="/cfb/"]')));
  ok('  and nothing to press that starts a term', !(await p.$('#g-start')));
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}
{
  const {p,errs}=await open(stub(true,'somebodyelse'));
  ok('signed in but not on the list, still nothing', await on(p,'s-gate'));
  ok('  and it does not make them feel they are missing the game',
    /nothing is missing/i.test(await txt(p,'#gate-say')), await txt(p,'#gate-say'));
  ok('  the badge still says testing', (await txt(p,'#tag'))==='In testing');
  /* AND IT SAYS WHICH ACCOUNT IT IS REFUSING. The list holds usernames, a username is not
     an email address, and an account signed in with Google may have none. The first list
     shipped with a username inferred from an email, matched nobody, and the screen said
     only "not on the list": nothing on it could tell a tester which of those had happened,
     or what to send to be added. This is that. */
  ok('  and it names the account it is refusing', !!(await p.$('#whoami')));
  ok('    with the username the list matches on',
    /somebodyelse/.test(await txt(p,'#who-name')), await txt(p,'#who-name'));
  /* The id is the handle that exists even when the username does not, so it is the one
     that has to be here. */
  ok('    and the account id, which exists either way',
    /[0-9a-f-]{36}/.test(await txt(p,'#who-id')), await txt(p,'#who-id'));
  ok('    and a way to copy it', !!(await p.$('#who-copy')));
  /* NO EMAIL ON THIS SCREEN. The gate reads a username and an id, so those are what it
     shows; putting the address here would mean testers pasting it into a chat to be added. */
  ok('    and it does not print an email address',
    !/@/.test(await txt(p,'#whoami')), await txt(p,'#whoami'));
  await p.screenshot({path:SS+'commish_notlisted.png'});
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== a tester takes the job ===');
{
  const {p,errs}=await open(tester());
  ok('the door opens', !!(await p.$('#g-start')));
  ok('  and the badge says so', (await txt(p,'#tag'))==='Tester');
  await p.screenshot({path:SS+'commish_gate.png'});

  await p.click('#g-start'); await p.waitForTimeout(700);
  ok('the office is the first thing you see', await on(p,'s-office'));
  const meters=await p.$$eval('#off-meters .meter span',(e)=>e.map((x)=>x.textContent));
  ok('  three meters', meters.length===3, meters.join(', '));
  const room=await p.$$eval('#off-room .bl',(e)=>e.length);
  ok('  and the whole room', room===9, room+' blocs');
  ok('  who hold votes', (await p.$$eval('#off-room .vt',(e)=>e.length))>0);
  const sport=await p.$$eval('#off-sport .fact',(e)=>e.map((x)=>x.textContent.replace(/\s+/g,' ')));
  ok('  with the sport as it stands', sport.length===4, sport.join(' | '));
  await p.screenshot({path:SS+'commish_office.png'});

  await p.click('#b-desk'); await skipSim(p); await p.waitForTimeout(600);
  ok('the desk has something on it', await on(p,'s-desk'));
  ok('  with a title', (await txt(p,'#d-title')).length>8, await txt(p,'#d-title'));
  const opts=await p.$$eval('#d-options .opt',(e)=>e.length);
  ok('  and options to rule on', opts>=2, opts+' options');
  ok('  the room is already arguing', (await p.$$eval('#d-voices .voice',(e)=>e.length))>0);
  ok('  and Rule is dead until something is picked',
    await p.$eval('#b-rule',(e)=>e.disabled));
  /* The paid tier's two headline powers, in front of a tester. */
  ok('a tester can test a policy first', await p.$eval('#b-test',(e)=>!e.hidden));
  ok('  and write their own ruling', !!(await p.$('#d-text')));

  await p.click('#d-options .opt:last-child'); await p.waitForTimeout(400);
  ok('picking an option arms the button', !(await p.$eval('#b-rule',(e)=>e.disabled)));
  await p.screenshot({path:SS+'commish_desk.png'});

  /* THE PREVIEW MUST NOT MOVE THE WORLD. applyEdit is pure so that this is true; if it
     ever stops being true, a player can farm the room by previewing. */
  const before=await p.evaluate(()=>localStorage.getItem('cfb_commish_term'));
  await p.click('#b-test'); await p.waitForTimeout(700);
  ok('testing it shows the room', await on(p,'s-room'));
  ok('  labelled as a what-if', /if you ruled/i.test(await txt(p,'#r-eyebrow')), await txt(p,'#r-eyebrow'));
  const after=await p.evaluate(()=>localStorage.getItem('cfb_commish_term'));
  ok('  and it changed nothing at all', before===after);
  await p.screenshot({path:SS+'commish_test.png'});
  await p.click('#b-next'); await p.waitForTimeout(500);
  ok('  and it goes back to the desk', await on(p,'s-desk'));

  await p.click('#b-rule'); await p.waitForTimeout(800);
  ok('ruling shows the room answering', await on(p,'s-room'));
  const says=await p.$$eval('#r-room .say',(e)=>e.map((x)=>x.textContent.trim()));
  ok('  every bloc says something', says.length===9, says.length+' answered');
  ok('  in their own words', new Set(says).size>3, says.slice(0,3).join(' | '));
  const deltas=await p.$$eval('#r-room .dl',(e)=>e.map((x)=>x.textContent.trim()));
  ok('  with a number each', deltas.length===9, deltas.join(' '));
  await p.screenshot({path:SS+'commish_room.png'});

  const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('cfb_commish_term')||'{}'));
  ok('the ruling reached the ledger', (saved.world&&saved.world.history||[]).length===1,
    (saved.world&&saved.world.history||[]).length+' rulings on the record');
  /* A LABEL IS A STRING WHETHER OR NOT IT IS PROSE, which is how the source of an arrow
     function got onto the record and shown to the player without anything failing. The
     title of an item about somebody in particular is a function of the cast, and one
     place was still concatenating it raw. Asserting it is truthy could not see that. */
  const label=(saved.world.history[0]||{}).label||'';
  ok('  under a readable name', label.length>8 && !/=>|function\s*\(|\{|\}/.test(label), label);
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== what a free player is shown ===');
{
  /* THE HALF OF THE DESIGN NOBODY ON THE TESTER LIST CAN SEE, because testers are treated
     as paying. `?tier=free` is the switch, and this is the check that it shows the offer
     rather than hiding it: a setting drawn and dead is the clearest a paywall ever gets,
     and a setting simply missing teaches nothing. */
  const {p,errs}=await open(tester(),390);
  await p.goto(URL+'?tier=free',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(2600);
  ok('a tester can look at the free version', !!(await p.$('#g-start')));
  ok('  and the badge says which view this is', /free/i.test(await txt(p,'#tag')), await txt(p,'#tag'));
  await p.click('#g-start'); await p.waitForTimeout(600);
  await p.click('#b-desk'); await skipSim(p); await p.waitForTimeout(500);
  ok('there is no box to write your own ruling', !(await p.$('#d-text')));
  ok('  and no testing a policy first', await p.$eval('#b-test',(e)=>e.hidden));
  /* NOT EVERY ITEM HAS DIALS, so landing on one and skipping is landing on nothing: the
     first run of this block drew an item with no settings, printed a skip, and asserted
     that an EMPTY list of numbers read correctly. That is a check that can never fail.
     Rule through beats until an item with settings comes up, and fail if none does. */
  /* AND A BUDGET WIDE ENOUGH THAT LUCK CANNOT DECIDE IT. Roughly a quarter of the docket
     carries settings and each item costs about three turns of this loop, so a budget of 24
     was reaching only eight items and failing outright about one run in ten. A test that
     fails one run in ten is a test people learn to re-run rather than read. */
  let steps=[], seen=0, beat=0, stuck='';
  while(beat++<75){
    if(await on(p,'s-office')){ await tap(p,'#b-desk'); await skipSim(p); await p.waitForTimeout(380); continue; }
    if(await on(p,'s-room')){ await tap(p,'#b-next'); await p.waitForTimeout(450); continue; }
    if(await on(p,'s-year')){ await tap(p,'#b-year-next'); await p.waitForTimeout(450); continue; }
    if(!(await on(p,'s-desk'))){ stuck='no screen the loop knows'; break; }
    seen++;
    const opt=await p.$('#d-options .opt'); if(opt){ await opt.click(); await p.waitForTimeout(400); }
    steps=await p.$$eval('.steps button',(e)=>e.map((x)=>({t:x.textContent.trim(),dead:x.disabled})));
    if(steps.length) break;
    if(!(await tap(p,'#b-rule'))){ stuck='Rule would not press on item '+seen; break; }
    await p.waitForTimeout(450);
  }
  ok('an item with settings comes up inside a season',
    steps.length>0, stuck || (seen+' items on the desk before one had settings'));
  ok('  the settings a free player cannot reach are still drawn',
    steps.some((x)=>x.dead), steps.map((x)=>x.t+(x.dead?'*':'')).join(' '));
  ok('  and dead rather than missing', steps.some((x)=>!x.dead));
  ok('  with the offer said once, quietly', !!(await p.$('.prolock')),
    await txt(p,'.prolock'));
  /* The bug the first screenshot caught: a media rights pool printed as a percentage.
     Any setting reading as a percentage over 100 is the same class of mistake. */
  const vals=steps.map((x)=>x.t);
  ok('  and no setting reads as the wrong kind of number',
    vals.length>0 && !vals.some((v)=>/^\d{3,}%$/.test(v)), vals.join(' '));
  await p.screenshot({path:SS+'commish_free.png'});
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== a season, and it survives the browser closing ===');
{
  const {p,errs}=await open(tester());
  await p.click('#g-start'); await p.waitForTimeout(600);
  /* Play until the year turns, which is the year in review. */
  let guard=0;
  while(guard++<40){
    if(await on(p,'s-year')) break;
    if(await on(p,'s-office')){ await tap(p,'#b-desk'); await skipSim(p); await p.waitForTimeout(380); continue; }
    if(await on(p,'s-desk')){
      const opt=await p.$('#d-options .opt');
      if(opt){ await opt.click(); await p.waitForTimeout(200); }
      if(!(await tap(p,'#b-rule'))) break;
      await p.waitForTimeout(450); continue;
    }
    if(await on(p,'s-room')){ await tap(p,'#b-next'); await p.waitForTimeout(450); continue; }
    break;
  }
  ok('a whole season plays', await on(p,'s-year'), 'in '+guard+' steps');
  ok('  and the year in review says where you stand',
    (await txt(p,'#y-say')).length>10, await txt(p,'#y-say'));
  await p.screenshot({path:SS+'commish_year.png'});

  const mid=await p.evaluate(()=>JSON.parse(localStorage.getItem('cfb_commish_term')).world);
  ok('  the sport has moved by the end of it',
    mid.playoff.teams!==12||mid.labour.revShare>0||mid.rules.confGames!==9||mid.history.length>3,
    mid.playoff.teams+'-team playoff, '+mid.history.length+' rulings, year '+mid.year);

  /* THE TERM IS THE SAVE FILE, which is what the ledger was built for. */
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForTimeout(2600);
  ok('closing the browser does not end the term', !!(await p.$('#g-resume')),
    await txt(p,'#g-resume'));
  await p.click('#g-resume'); await p.waitForTimeout(600);
  const back=await p.evaluate(()=>JSON.parse(localStorage.getItem('cfb_commish_term')).world);
  ok('  and it comes back where it was', back.year===mid.year&&back.history.length===mid.history.length,
    back.year+', '+back.history.length+' rulings');
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

await b.close();
console.log(bad?'\nFAILURES: '+bad:'\nall clear');
process.exit(bad?1:0);
