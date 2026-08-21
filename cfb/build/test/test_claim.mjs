/* WHAT A GUEST EARNED, AND THE OFFER TO KEEP IT.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   (nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
 *   node cfb/build/test/test_claim.mjs
 *
 * A guest used to be told nothing at all. That rule was half right: what it was protecting
 * against is a trophy case kept in one browser's storage, which vanishes when the browser is
 * cleared and never reaches a phone. But the seasons underneath it are already on the board,
 * submitted with no name on them, so the badges are not a promise this game cannot keep.
 * They are a promise it has to be asked to keep.
 *
 * SO THE PANEL HAS TO BE TRUE, and that is most of what is under test here. Three things
 * have to hold or the sentence on the results screen is a lie:
 *
 *   the badges named are the ones the season actually earned
 *   signing in claims the season on screen AND every season before it
 *   the trophy case afterwards holds what the panel said it would
 *
 * The middle one is the one that would ship broken and look fine. Half this catalog counts
 * seasons rather than describing one, so a sign-in that claimed only the season on screen
 * would hand "Finish 10 seasons" to an account with one row on it.
 */
import { chromium } from 'playwright';
const SS='/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const UID='11111111-1111-1111-1111-111111111111';

/* The library, with a way to sign in halfway through a session that started signed out,
   which is the whole shape of this feature. */
const stub=(inn)=>`
window.supabase={createClient(){
  const S={access_token:'${UID}',user:{id:'${UID}',email:'coach@example.com'}};
  let session=${inn}?S:null, cb=null;
  window.__signIn=()=>{ session=S; if(cb) cb('SIGNED_IN',session); };
  return {auth:{
    onAuthStateChange(f){cb=f;return{data:{}}},
    getSession:()=>Promise.resolve({data:{session}}),
    signInWithPassword:()=>{window.__signIn();return Promise.resolve({error:null})},
    signUp:()=>Promise.resolve({error:null}),
    signInWithOAuth:()=>Promise.resolve({error:null}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:{username:'coachprime'}})}}}}}},
    rpc(name,args){
      /* EVERY CLAIM IS RECORDED, because "it claimed them all" is the assertion and the
         page has no way to show it. cfb_claim_run answers true for a row nobody owns. */
      if(name==='cfb_claim_run'){
        window.__claimed=window.__claimed||[];
        window.__claimed.push(args&&args.p_id);
        return Promise.resolve({data:true,error:null});
      }
      return Promise.resolve({data:true,error:null});
    }}}};
window.PS_CFB_BOARD_URL='http://localhost:5555';`;

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
let bad=0;
const ok=(n,p,x)=>{if(!p)bad++;console.log((p?'  ok   ':' FAIL  ')+n+(x!==undefined?'   '+x:''));};

/* One season, drafted worst-first so it ends at seeding rather than at the playoff gate,
   which is a wall a guest cannot pass and would hang this file against. */
async function playSeason(p){
  await p.evaluate(()=>document.getElementById('b-play-intro').click());
  await p.waitForTimeout(1400);
  for(let i=0;i<40;i++){
    if(await p.$('#s-squad.on')) break;
    const slot=await p.$('#sheet.on .slotopt[data-i]');
    if(slot){ await slot.click(); await p.waitForTimeout(800); continue; }
    const took=await p.evaluate(()=>{
      const t=[...document.querySelectorAll('#opts .tile:not(.off)')];
      if(!t.length) return false;
      const f=(e)=>parseFloat((e.querySelector('.pts b')||{}).textContent||'0')||0;
      t.sort((a,b)=>f(a)-f(b));
      t[0].click(); return true;
    });
    await p.waitForTimeout(took?2200:600);
  }
  const x=await p.$('#gp-x'); if(x){ await x.click(); await p.waitForTimeout(500); }
  await p.evaluate(()=>{const x=document.getElementById('b-play');if(x)x.click();});
  await p.waitForTimeout(1100);
  for(let i=0;i<30;i++){
    if(await p.$('#s-over.on')) break;
    await p.evaluate(()=>{for(const id of ['b-sim','b-po-fast','b-po-skip','b-po','b-bowl-fast']){
      const x=document.getElementById(id);if(x&&!x.hidden&&x.offsetParent!==null){x.click();return;}}});
    await p.waitForTimeout(1200);
  }
  await p.waitForTimeout(2500);
}
const claim=(p)=>p.evaluate(()=>{
  const el=document.querySelector('#o-claim .claimbox');
  if(!el) return null;
  return {
    done:el.classList.contains('done'),
    kicker:(el.querySelector('.cb-k')||{}).textContent||'',
    title:(el.querySelector('.cb-t')||{}).textContent||'',
    body:(el.querySelector('.cb-s')||{}).textContent||'',
    badges:[...el.querySelectorAll('.ach .ach-n')].map(e=>e.textContent),
    cta:(el.querySelector('button')||{}).textContent||'',
  };
});

console.log('\n=== a guest finishes a season that earned something ===');
{
  const p=await b.newPage({viewport:{width:600,height:1100}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(stub(false));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(3000);
  await playSeason(p);
  ok('the season finished', !!(await p.$('#s-over.on')));
  const c=await claim(p);
  ok('the results screen says what was earned', !!c, c?c.kicker:'no panel');
  if(c){
    ok('  it names the badges rather than counting them', c.badges.length>0, c.badges.join(' | '));
    /* The whole difference between this and a toast: the cards carry the description, so
       what is being offered is what you DID and not a list of nicknames. */
    ok('  with what each one was', (await p.$$eval('#o-claim .ach-d',e=>e.map(x=>x.textContent)))
      .every(t=>t.trim().length>4),
      (await p.$$eval('#o-claim .ach-d',e=>e.map(x=>x.textContent))).join(' | '));
    ok('  and offers to claim them', /claim/i.test(c.cta), c.cta);
    ok('  saying the season is on the board already', /on the board/i.test(c.body), c.body);
  }
  /* NOT ANNOUNCED. A toast is a celebration and it is for somebody who gets to keep it. */
  ok('  nothing is toasted at them', (await p.$$eval('#achtoasts .achtoast',e=>e.length))===0);
  await p.screenshot({path:SS+'claim_offer.png'});

  /* THE BUTTON GOES WHERE IT SAYS. */
  await p.click('#cb-in'); await p.waitForTimeout(800);
  ok('  the button opens the sign-in form', !!(await p.$('#ac-email')));

  const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('cfb_history')||'[]'));
  ok('  the season was written down with the board id on it', !!(before[0]&&before[0].run_id),
    before.length+' rows');

  await p.evaluate(()=>window.__signIn()); await p.waitForTimeout(2500);
  const claimed=await p.evaluate(()=>window.__claimed||[]);
  ok('signing in claims it', claimed.length>=1, claimed.join(', '));
  /* Once. The season on screen is claimed by the block that the placing line is waiting on,
     and the sweep behind it skips that row rather than asking for it a second time. */
  ok('  exactly once', claimed.length===new Set(claimed).size, claimed.join(', '));
  const c2=await claim(p);
  ok('  and the panel says so', !!(c2&&c2.done), c2?c2.kicker:'no panel');
  /* The payoff is the panel they pressed, so the sheet that was covering it gets out of
     the way rather than leaving them to find the close button. */
  ok('  with the sheet out of the way of it', !(await p.$('#sheet.on')));
  ok('  offering the case rather than the sign-in', /trophy case/i.test((c2&&c2.cta)||''),
    c2&&c2.cta);
  const after=await p.evaluate(()=>JSON.parse(localStorage.getItem('cfb_history')||'[]'));
  ok('  and the row is marked claimed, so it is not claimed twice',
    after.every(r=>r.claimed===true));
  await p.screenshot({path:SS+'claim_done.png'});
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== every season before it, not just the one on screen ===');
{
  /* THE ONE THAT WOULD SHIP BROKEN AND LOOK FINE. Half this catalog counts seasons rather
     than describing one, so a sign-in that took only the season on screen would put
     "Finish 10 seasons" on an account holding a single row. */
  const p=await b.newPage({viewport:{width:600,height:1100}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  /* Four seasons this browser played as a guest, each already on the board under its own
     id, the way submitRun leaves them. */
  await p.addInitScript(stub(false)+`
    localStorage.setItem('cfb_history', JSON.stringify(
      ['a','b','c','d'].map((k,i)=>({created_at:new Date(Date.now()-(4-i)*864e5).toISOString(),
        regular_wins:8,playoff_wins:0,title_won:false,perfect:false,made_playoffs:false,
        national_rank:40,bowl:true,bowl_won:false,run_mode:'free',overall:70,
        respins:0,picks:[],run_id:'run-'+k}))));`);
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(3000);
  await p.evaluate(()=>window.__signIn()); await p.waitForTimeout(4000);
  const claimed=await p.evaluate(()=>window.__claimed||[]);
  ok('all four earlier seasons are claimed', claimed.length===4, claimed.join(', '));
  ok('  each exactly once', new Set(claimed).size===claimed.length);
  const rows=await p.evaluate(()=>JSON.parse(localStorage.getItem('cfb_history')||'[]'));
  ok('  and all four are marked', rows.filter(r=>r.claimed).length===4);

  /* THE SWEEP RUNS ONCE. auth fires its listener on every token refresh, and a sweep on
     each of those is the same rows claimed over and over all session. */
  await p.evaluate(()=>window.__signIn()); await p.waitForTimeout(2500);
  ok('  a second auth event does not claim them again',
    (await p.evaluate(()=>(window.__claimed||[]).length))===4);
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== who does not see the offer ===');
{
  /* A member has had the badges announced already, so the panel would be a second telling
     of the same news with a button that does nothing for them. */
  const p=await b.newPage({viewport:{width:600,height:1100}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(stub(true));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(3000);
  await p.evaluate((uid)=>localStorage.setItem('cfb_ach_seen',
    JSON.stringify({[uid]:['__nothing_real__']})),UID);
  await playSeason(p);
  ok('a member gets no claim panel', !(await claim(p)));
  ok('  they get the toasts instead', (await p.$$eval('#achtoasts .achtoast',e=>e.length))>0);
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

console.log('\n=== accounts are offline ===');
{
  /* No sign-in library at all, which in the wild is an ad blocker. There is nothing to
     claim with, so an offer to claim is an offer they cannot take. gateState() is empty in
     that state and the panel goes with it. */
  const p=await b.newPage({viewport:{width:600,height:1100}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8080/cfb/index.html',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(3000);
  await playSeason(p);
  await p.waitForTimeout(14000);   // past auth.js's GIVE_UP_MS, so it has truly given up
  ok('the season still finishes', !!(await p.$('#s-over.on')));
  ok('and there is no offer to take', !(await claim(p)));
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

await b.close();
console.log(bad?'\nFAILURES: '+bad:'\nall clear');
process.exit(bad?1:0);
