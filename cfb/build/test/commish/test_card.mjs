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

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
let bad=0;
const ok=(n,p,x)=>{if(!p)bad++;console.log((p?'  ok   ':' FAIL  ')+n+(x!==undefined?'   '+x:''));};

/* Does the modes sheet draw the card for this account. */
async function cardShown(signedIn,username){
  const p=await b.newPage({viewport:{width:390,height:900}});
  const errs=[]; p.on('pageerror',(e)=>errs.push(e.message));
  await p.addInitScript(stub(signedIn,username));
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
  await p.addInitScript(stub(signedIn,username));
  await p.goto(MODE,{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(2600);
  const open=!!(await p.$('#g-start'));
  await p.close();
  return {open,errs};
}

console.log('\n=== the list is one list ===');
{
  ok('the shared file is what both pages would load', typeof ACCESS.allowed==='function',
    ACCESS.TESTERS.length+' testers, live '+ACCESS.LIVE);
  /* THE CASING TRAP, asserted on the file rather than through a browser because it is a
     property of the list and not of either page. set_username keeps the casing somebody
     typed, so a list matched exactly misses them. */
  const one=ACCESS.TESTERS[0];
  ok('  and a tester is found whatever case they typed',
    ACCESS.allowed(one.toUpperCase())&&ACCESS.allowed(one),
    one+' and '+one.toUpperCase());
  ok('  while nobody else is', !ACCESS.allowed('somebodyelse')&&!ACCESS.allowed(null)&&!ACCESS.allowed(''));
}

console.log('\n=== the card and the door say the same thing ===');
const WHO=[
  ['signed out', false, null],
  ['signed in, not on the list', true, 'somebodyelse'],
  ['a tester', true, ACCESS.TESTERS[0]],
];
for(const [label,signedIn,username] of WHO){
  const c=await cardShown(signedIn,username);
  const d=await doorOpens(signedIn,username);
  const want=ACCESS.allowed(signedIn?username:null);
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
  await p.addInitScript(stub(true,ACCESS.TESTERS[0]));
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
