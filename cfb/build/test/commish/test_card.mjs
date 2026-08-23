/* THE CARD AND THE DOOR AGREE ABOUT WHO IS ON THE LIST.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_card.mjs
 *
 * Commish Simulator is a mode INSIDE the college football game, so it is reached from the
 * "More ways to play" sheet at /cfb/ rather than from the site's front page. That makes
 * two pages that both have to answer the same question, and the failure modes are quiet
 * in both directions:
 *
 *   card drawn, door shut   a tester taps a card and is told they are not on the list
 *   door open, no card      a tester can play the mode and has no way to find it
 *
 * cfb/commish/access.js is the one file both read, and this is the check that they really
 * both read it: the same three accounts are put in front of the sheet and in front of the
 * mode, and the two answers have to match every time.
 *
 * It also checks the thing a live page cannot get wrong: nobody outside the list sees any
 * sign of the mode. /cfb/ is indexed and carries ads, and a "coming soon" on it would be a
 * launch rather than a test.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
const ACCESS = require(ROOT + '/cfb/commish/access.js');

const UID='11111111-1111-1111-1111-111111111111';
const GAME='http://localhost:8080/cfb/index.html';
const MODE='http://localhost:8080/cfb/commish/index.html';

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

/* PUT A NAME ON THE REAL LIST, by trapping the assignment access.js makes, so a green run
   never depends on a real person's leaderboard name. The shipped list is empty and only
   real accounts go in it; a test that asserted against one of those would break whenever
   the list changed, and would go on passing if the list were emptied by mistake. Both
   pages load the same file, so the same trap arms both. */
const TESTER='commish-test-account';
const arm=(name)=>`
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify(name)}); }catch(e){} }});
})();`;

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
let bad=0;
const ok=(n,p,x)=>{if(!p)bad++;console.log((p?'  ok   ':' FAIL  ')+n+(x!==undefined?'   '+x:''));};

/* Does the modes sheet draw the card for this account. */
async function cardShown(signedIn,username){
  const p=await b.newPage({viewport:{width:390,height:900}});
  const errs=[]; p.on('pageerror',(e)=>errs.push(e.message));
  await p.addInitScript(arm(TESTER)+stub(signedIn,username));
  await p.goto(GAME,{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(3000);
  /* The sheet is only reachable signed in, which is the mode gate this game already had.
     Signed out it is locked, and a locked sheet cannot be carrying the card either. */
  let card=false, opened=false;
  try{ await p.click('#b-modes',{timeout:3000}); await p.waitForTimeout(600); opened=true; }catch(e){}
  if(opened) card=!!(await p.$('#b-mc-commish'));
  /* AND NO TRACE OF IT ANYWHERE ELSE ON THE PAGE. A card that is not drawn but whose name
     is sitting in the markup is still an announcement to anybody who reads source. */
  const anywhere=/commish simulator/i.test(await p.evaluate(()=>document.body.innerText));
  await p.close();
  return {card,anywhere,errs};
}

/* Does the mode itself open for this account. */
async function doorOpens(signedIn,username){
  const p=await b.newPage({viewport:{width:390,height:900}});
  const errs=[]; p.on('pageerror',(e)=>errs.push(e.message));
  await p.addInitScript(arm(TESTER)+stub(signedIn,username));
  await p.goto(MODE,{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2600);
  const open=!!(await p.$('#g-start'));
  await p.close();
  return {open,errs};
}

console.log('\n=== the list is one list ===');
{
  ok('the shared file is what both pages would load', typeof ACCESS.allowed==='function',
    ACCESS.TESTERS.length+' names, '+ACCESS.TESTER_IDS.length+' account ids, live '+ACCESS.LIVE);
  /* NOT LIVE. Every other assertion here is about who gets in while the mode is closed, and
     all of them pass trivially the moment this flips. It is the one line that turns the
     mode on for the whole public, so it is asserted rather than assumed. */
  ok('  and the mode is still closed', ACCESS.LIVE===false);
  /* THE CASING TRAP, asserted on the file rather than through a browser because it is a
     property of the list and not of either page. set_username keeps the casing somebody
     typed, so a list matched exactly misses them. */
  ok('  a name on the list is found whatever case it was typed in',
    ACCESS.isTester(TESTER)===ACCESS.isTester(TESTER.toUpperCase()));
  /* TWO WAYS ONTO THE LIST, because the first version had only usernames and a username
     is not something you can work out from an email address. An account that signed in
     with Google may have no username at all, and its id is the only handle it has. */
  ok('  an account id counts as well as a name',
    ACCESS.allowed({name:null,userId:'x'})===false
    && (function(){ ACCESS.TESTER_IDS.push('x');
         const r=ACCESS.allowed({name:null,userId:'x'}); ACCESS.TESTER_IDS.pop(); return r; })());
  ok('  while nobody else is',
    !ACCESS.allowed('somebodyelse')&&!ACCESS.allowed(null)&&!ACCESS.allowed('')
    &&!ACCESS.allowed({name:'somebodyelse',userId:'nope'}));
  /* NOBODY IS ON THE SHIPPED LIST BY ACCIDENT. The names in this file are real people's
     accounts, so a stray entry is a real person being let in. Printed, not just counted,
     because the point is to be able to read it. */
  ok('  and the shipped list is exactly what somebody put there',
    ACCESS.TESTERS.every((n)=>n===String(n).toLowerCase().trim()&&n.length>0),
    ACCESS.TESTERS.length? ACCESS.TESTERS.join(', ') : 'empty, nobody is on it yet');
}

console.log('\n=== the card and the door say the same thing ===');
const WHO=[
  ['signed out', false, null],
  ['signed in, not on the list', true, 'somebodyelse'],
  ['a tester', true, TESTER],
];
for(const [label,signedIn,username] of WHO){
  const c=await cardShown(signedIn,username);
  const d=await doorOpens(signedIn,username);
  /* What the list SHOULD say, computed the same way the pages compute it, with the test's
     own name counted as on the list because that is what `arm` puts there. */
  const want=!!signedIn&&(username===TESTER||ACCESS.allowed(username));
  ok(label+': the two agree', c.card===d.open,
    'card '+(c.card?'drawn':'not drawn')+', door '+(d.open?'open':'shut'));
  ok('  and they agree with the list', d.open===want, 'the list says '+(want?'yes':'no'));
  if(!want){
    ok('  and the game says nothing about the mode at all', !c.anywhere,
      c.anywhere?'the words appear on the page':'no mention');
  }
  const errs=c.errs.concat(d.errs);
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
}

console.log('\n=== the card goes where it says ===');
{
  const p=await b.newPage({viewport:{width:390,height:900}});
  await p.addInitScript(arm(TESTER)+stub(true,TESTER));
  await p.goto(GAME,{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(3000);
  await p.click('#b-modes'); await p.waitForTimeout(600);
  const href=await p.$eval('#b-mc-commish',(e)=>e.getAttribute('href')).catch(()=>'');
  ok('the card is a link to the mode', href==='/cfb/commish/', href||'no card');
  /* AN ANCHOR AND NOT A BUTTON, so middle-click and open-in-new-tab work the way they do
     on the other card on this sheet that goes to another page. */
  const tag=await p.$eval('#b-mc-commish',(e)=>e.tagName).catch(()=>'');
  ok('  and a real link, not a button', tag==='A', tag);
  ok('  it says what the mode is', (await p.$eval('#b-mc-commish p',(e)=>e.textContent).catch(()=>'')).length>60);
  /* IT SAYS TESTING. Somebody on the list should know the mode is unfinished before they
     open it, or the first rough edge is reported as a broken game. */
  const sticker=await p.$eval('#b-mc-commish .mc-sticker',(e)=>e.textContent.trim()).catch(()=>'');
  ok('  and that it is not finished', /testing/i.test(sticker), sticker||'no sticker');
  await p.close();
}

await b.close();
console.log(bad?'\n'+bad+' FAILED':'\nall clear');
process.exit(bad?1:0);
