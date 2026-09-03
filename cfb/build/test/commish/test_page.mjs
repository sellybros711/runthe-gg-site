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
import { createRequire } from 'module';
import path from 'path';
const require=createRequire(import.meta.url);
const ROOT=path.resolve(import.meta.dirname,'../../../..');
/* HOW BIG THE DOCKET IS, READ RATHER THAN ASSUMED, so a walk budget sized against it cannot
   silently become too small the next time somebody adds thirty items. Same reasoning, and the
   same line, as test_desk. */
const DOCKET_ITEMS=require(ROOT+'/cfb/commish/docket.js').ITEMS.length;
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
    const up = await pg.$eval('#off-monthcard', (e) => e.classList.contains('running')).catch(() => false);
    if (!up) return;
    await pg.click('#off-monthcard', { timeout: 1500 }).catch(() => {});
    await pg.waitForTimeout(110);
  }
}


/* A CUTSCENE CAN TAKE THE SCREEN THE MOMENT A TERM STARTS, and one that a walker does not
   know about is a walker that stalls on the one screen with no dock. Skip it: the scenes have
   their own suite in test_scene, and every other file here is testing something behind them.
   Called after anything that could arrive at the office. */
async function pastScene(pg) {
  for (let i = 0; i < 6; i++) {
    const up = await pg.$eval('#s-scene', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) return;
    await pg.click('#b-scene-skip').catch(() => {});
    await pg.waitForTimeout(320);
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

/* MEDIA DAYS SITS BETWEEN THE OFFICE AND THE DESK, one beat a year. Pressing on at that beat
   opens a lectern rather than a folder, and a walker that only knows about the desk stalls
   there with nothing it recognises on screen. Three answers and it is a desk again. */
async function podium(pg) {
  for (let i = 0; i < 6; i++) {
    const up = await pg.$eval('#s-press', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) return;
    await pg.click('#p-answers .opt').catch(() => {});
    await pg.waitForTimeout(160);
    await pg.click('#b-say').catch(() => {});
    await pg.waitForTimeout(520);
  }
}

const txt=(p,sel)=>p.$eval(sel,(e)=>(e.textContent||'').replace(/\s+/g,' ').trim()).catch(()=>'');

console.log('\n=== every module the page needs is actually loaded ===');
{
  /* THE FAILURE THIS EXISTS FOR IS INVISIBLE EVERYWHERE ELSE. The modules capture each other
     off `window` at load time, so a script tag in the wrong order leaves a consumer holding
     undefined forever: docket.js loaded before venues.js has no host sites, every venue item
     is quietly ineligible, the title game is worth the same wherever it is played, and
     nothing throws. Node cannot catch it either, because require() does not care about the
     order of tags in an HTML file. Only a browser can, and only if it looks. */
  const {p,errs}=await open(tester());
  const mods=await p.evaluate(()=>({
    engine:!!window.PS_CFB_ENGINE||typeof window.createSeededRNG==='function',
    ledger:!!window.PS_CFB_LEDGER, blocs:!!window.PS_CFB_BLOCS, venues:!!window.PS_CFB_VENUES,
    docket:!!window.PS_CFB_DOCKET, season:!!window.PS_CFB_SEASON, council:!!window.PS_CFB_COUNCIL,
    feed:!!window.PS_CFB_FEED, calendar:!!window.PS_CFB_CALENDAR,
    situation:!!window.PS_CFB_SITUATION, fallout:!!window.PS_CFB_FALLOUT,
    churn:!!window.PS_CFB_CHURN, rivals:!!window.PS_CFB_RIVALS, report:!!window.PS_CFB_REPORT,
  }));
  const dead=Object.keys(mods).filter((k)=>k!=='engine'&&!mods[k]);
  ok('every module is on the page',!dead.length,dead.join(', ')||Object.keys(mods).length+' modules');
  /* AND THE ONES THAT READ EACH OTHER GOT A REAL OBJECT rather than undefined, which is the
     part the presence check above cannot see. */
  const wired=await p.evaluate(()=>{
    const D=window.PS_CFB_DOCKET, V=window.PS_CFB_VENUES;
    if(!D||!V) return {ok:false,why:'a module is missing'};
    /* An item whose options are real cities can only build a cast if it found the catalog. */
    const it=D.BY_ID['title-site'];
    if(!it) return {ok:false,why:'no title-site item'};
    const L=window.PS_CFB_LEDGER;
    const w=L.createWorld({year:2025,membership:{}});
    let c=null;
    try{ c=D.castOf(it,w,L,()=>0.5,D.NOSIT); }catch(e){ return {ok:false,why:String(e)}; }
    return {ok:!!(c&&c.bids&&c.bids.length===3),
      why:c&&c.bids?c.bids.map((v)=>v.city).join(', '):'no bids'};
  });
  ok('  and the docket can see the host sites through the page',wired.ok,wired.why);
  /* AND SEASON.JS CAPTURED CHURN, which the presence check above genuinely cannot see: put
     the tag after season.js instead of before it and window.PS_CFB_CHURN is still perfectly
     alive by the time anybody looks, while the reference season.js took at load time is null
     forever. The symptom is not an error, it is that the sport stops moving. So this asks the
     engine for a season five years into a term and checks that somebody has moved off the
     number they started on and that a December has a carousel in it. */
  const churned=await p.evaluate(async()=>{
    const L=window.PS_CFB_LEDGER, S=window.PS_CFB_SEASON, E=window.PS_CFB_ENGINE;
    if(!L||!S||!E) return {ok:false,why:'a module is missing'};
    let teams;
    try{
      const r=await fetch('/cfb/data/cfb_fbs.json?v=1');
      teams=await r.json();
    }catch(e){ return {ok:false,why:'no team data: '+e}; }
    const w=L.createWorld({year:2025,membership:L.membershipFrom(teams,2025),seed:11});
    w.year=2030;
    let sim;
    try{ sim=S.play(w,teams,E.createSeededRNG(3)); }catch(e){ return {ok:false,why:String(e)}; }
    const moved=sim.teams.filter((t)=>Math.abs(t.z-t.baseZ)>0.2).length;
    return {ok:moved>10&&sim.carousel.length>0,
      why:moved+' of '+sim.teams.length+' teams moved, '+sim.carousel.length+' coaching changes'};
  });
  ok('  and the season engine got churn through the page',churned.ok,churned.why);
  /* AND IT GOT THE RIVALRIES, which is the same class of failure: rivals.js loaded after
     season.js leaves the reference null forever, the schedule fills by conference and then at
     random, and Ohio State plays Michigan about one year in five. Nothing throws. */
  const rivals=await p.evaluate(async()=>{
    const L=window.PS_CFB_LEDGER, S=window.PS_CFB_SEASON, E=window.PS_CFB_ENGINE;
    if(!L||!S||!E) return {ok:false,why:'a module is missing'};
    let teams;
    try{ teams=await (await fetch('/cfb/data/cfb_fbs.json?v=1')).json(); }
    catch(e){ return {ok:false,why:'no team data'}; }
    const w=L.createWorld({year:2025,membership:L.membershipFrom(teams,2025),seed:13});
    let sim;
    try{ sim=S.play(w,teams,E.createSeededRNG(5)); }catch(e){ return {ok:false,why:String(e)}; }
    const named=sim.games.filter((g)=>g.rivalry);
    const game=named.find((g)=>g.rivalry==='the-game');
    return {ok:named.length>20&&!!game,
      why:named.length+' named games, The Game '+(game?'in week '+game.week:'NOT PLAYED')};
  });
  ok('  and the rivalries through it too',rivals.ok,rivals.why);
  ok('  no page errors',!errs.length,errs.join(' | ')||'none');
  await p.close();
}

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
  await pastScene(p);
  ok('the office is the first thing you see', await on(p,'s-office'));
  /* THE LABEL SPAN, not every span. The office tiles carry a second one now saying where the
     number started, so a bare `span` counts six and reports three meters as a failure. */
  const meters=await p.$$eval('#off-meters .meter > span:not(.fr)',(e)=>e.map((x)=>x.textContent));
  ok('  three meters', meters.length===3, meters.join(', '));
  /* AND EACH ONE SAYS WHAT IT USED TO BE. A number between 0 and 100 with nothing to measure
     it against was the whole complaint: "how do i know if these are good or not". */
  const froms=await p.$$eval('#off-meters .meter .fr',(e)=>e.map((x)=>x.textContent.trim()));
  ok('  each measured against where the term began', froms.length===3
    && froms.every((s)=>s.length>0), froms.join(' | '));
  const room=await p.$$eval('#off-room .bl',(e)=>e.length);
  ok('  and the whole room', room===9, room+' blocs');
  /* AND ONLY ONCE. The strip above draws the six blocs that hold a vote, weighted, against
     the line that ends the term; this list draws all nine with a number on them. They were
     both drawing a vote badge and a bar per bloc, which is one card's worth of information
     laid out twice on one screen. The office's list gives up everything the strip says. */
  ok('  each with a number rather than a second bar',
    (await p.$$eval('#off-room .bl .dl',(e)=>e.length))===9
    && (await p.$$eval('#off-room .bar',(e)=>e.length))===0
    && (await p.$$eval('#off-room .vt',(e)=>e.length))===0);
  ok('  and it points at the strip for the votes',
    /strip above/i.test(await txt(p,'#off-room .rkey')));
  const sport=await p.$$eval('#off-sport .fact',(e)=>e.map((x)=>x.textContent.replace(/\s+/g,' ')));
  ok('  with the sport as it stands', sport.length===4, sport.join(' | '));
  /* ONE CALENDAR. The year strip and the month grid are the same calendar at two zooms and
     they used to be two cards stacked on each other, each headed as a calendar. The question
     that came back was "why do we have two calendars". Counting cards is the assertion,
     because either painter could be perfect and the screen still ask that question. */
  ok('  and one calendar rather than two',
    (await p.$$eval('#s-office .cal',(e)=>e.length))===1
    && (await p.$eval('#off-monthcard #off-cal',(e)=>!!e).catch(()=>false)));
  /* AND THE YEAR CARD DOES NOT CREDIT YOU WITH A YEAR YOU HAVE NOT WRITTEN. On the first
     morning these nine rows are the defaults the sport handed over, and the card was headed
     "The year, as you have written it" above every one of them. */
  const yhead=(await txt(p,'#off-yearhead'));
  ok('  the year you were handed says so', /handed/i.test(yhead), yhead);
  ok('    with nothing marked as changed',
    (await p.$$eval('#off-year .yr.moved',(e)=>e.length))===0);
  await p.screenshot({path:SS+'commish_office.png'});

  await p.click('#b-desk'); await skipSim(p); await p.waitForTimeout(600);
  await podium(p);
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
  ok('  labeled as a what-if', /if you ruled/i.test(await txt(p,'#r-eyebrow')), await txt(p,'#r-eyebrow'));
  const after=await p.evaluate(()=>localStorage.getItem('cfb_commish_term'));
  ok('  and it changed nothing at all', before===after);
  await p.screenshot({path:SS+'commish_test.png'});
  await p.click('#b-next'); await p.waitForTimeout(500);
  ok('  and it goes back to the desk', await on(p,'s-desk'));

  await p.click('#b-rule'); await p.waitForTimeout(800);
  /* NINE RULINGS PLAY OUT AS A CUTSCENE BEFORE THE ROOM ANSWERS, and which item is on the
     desk here depends on the term's seed, so whether this particular ruling is one of them
     is a coin flip from run to run. The scene is asserted in test_scene; here it is a screen
     on the way to the one being tested. Without this the suite fails a few runs in ten on a
     feature that is working. */
  await pastScene(p);
  ok('ruling shows the room answering', await on(p,'s-room'));
  const says=await p.$$eval('#r-room .say',(e)=>e.map((x)=>x.textContent.trim()));
  ok('  every bloc says something', says.length===9, says.length+' answered');
  /* AND THE FULL FORM IS STILL THE FULL FORM WHERE THE EXTRA COLUMNS MEAN SOMETHING. The
     office's list is compact because the strip above it already carries the votes. Here the
     row carries a move, a direction and a line of dialogue, none of which is on any strip,
     so the compact form must not have followed the function onto this screen. */
  ok('  the reaction screen keeps the votes it was given',
    (await p.$$eval('#r-room .vt',(e)=>e.length))>0);
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
  await pastScene(p);
  await p.click('#b-desk'); await skipSim(p); await p.waitForTimeout(500);
  await podium(p);
  ok('there is no box to write your own ruling', !(await p.$('#d-text')));
  ok('  and no testing a policy first', await p.$eval('#b-test',(e)=>e.hidden));
  /* NOT EVERY ITEM HAS DIALS, so landing on one and skipping is landing on nothing: the
     first run of this block drew an item with no settings, printed a skip, and asserted
     that an EMPTY list of numbers read correctly. That is a check that can never fail.
     Rule through beats until an item with settings comes up, and fail if none does. */
  /* AND A BUDGET WIDE ENOUGH THAT LUCK CANNOT DECIDE IT. A test that fails one run in ten is
     a test people learn to re-run rather than read.

     THE NUMBER IN THE OLD NOTE WAS STALE AND THAT IS WHY IT KEPT FLAKING. It said roughly a
     quarter of the docket carries settings; six of ninety-one do, which is seven per cent, and
     the docket has grown a lot since somebody counted. Drawing without replacement, twenty-five
     items miss one about fourteen times in a hundred, which is exactly the rate this was
     failing at. Fifty-five items misses three times in a thousand.

     Each item costs about three turns of this loop, so the budget is sized off ITEMS rather
     than turns, and off the docket rather than a number typed once. */
  let steps=[], seen=0, beat=0, stuck='';
  while(beat++<Math.max(75,DOCKET_ITEMS*2)){
    if(await on(p,'s-office')){ await tap(p,'#b-desk'); await skipSim(p); await p.waitForTimeout(380); continue; }
    if(await on(p,'s-room')){ await tap(p,'#b-next'); await p.waitForTimeout(450); continue; }
    if(await on(p,'s-press')){ await podium(p); continue; }
    if(await on(p,'s-scene')){ await pastScene(p); continue; }
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
  await pastScene(p);
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
    if(await on(p,'s-press')){ await podium(p); continue; }
    if(await on(p,'s-scene')){ await pastScene(p); continue; }
    break;
  }
  ok('a whole season plays', await on(p,'s-year'), 'in '+guard+' steps');
  ok('  and the year in review says where you stand',
    (await txt(p,'#y-say')).length>10, await txt(p,'#y-say'));
  await p.screenshot({path:SS+'commish_year.png'});

  const mid=await p.evaluate(()=>JSON.parse(localStorage.getItem('cfb_commish_term')).world);

  /* BEING VOTED OUT IS A WIN CONDITION FOR THIS WALK, NOT A TEST FAILURE, and the walk cannot
     avoid it. It takes the first option of every item it is shown, which is the most
     aggressive commissioner the game can be handed, and a term is seeded from Date.now() and
     Math.random(), so which items come up differs on every run. Draw two that anger the SEC
     and the Big Ten in the same year and the coalition removes you, correctly, in February.

     The two assertions below are about a term that CONTINUES: that the sport moved and that
     the save survives a reload. Neither is a meaningful question about a term that has ended,
     and asserting them anyway made this file fail at random on a legitimate outcome. So a
     removal is reported and skipped rather than counted, and the run still says which happened
     so that a suite that NEVER reaches the second half is visible rather than quietly green. */
  const gone=!!(mid.outcome&&mid.outcome.removed);
  if(gone){
    console.log('  note: this walk was voted out in '+mid.year+' after '+mid.history.length
      +' rulings, which is a real outcome and not a failure. Skipping the two assertions '
      +'about a term that continues.');
  }else{
    ok('  the sport has moved by the end of it',
      mid.playoff.teams!==12||mid.labour.revShare>0||mid.rules.confGames!==9||mid.history.length>3,
      mid.playoff.teams+'-team playoff, '+mid.history.length+' rulings, year '+mid.year);

    /* THE TERM IS THE SAVE FILE, which is what the ledger was built for. */
    await p.reload({waitUntil:'domcontentloaded'});
    await p.waitForTimeout(2600);
    ok('closing the browser does not end the term', !!(await p.$('#g-resume')),
      await txt(p,'#g-resume'));
    if(await p.$('#g-resume')){
      await p.click('#g-resume'); await p.waitForTimeout(600);
      const back=await p.evaluate(()=>JSON.parse(localStorage.getItem('cfb_commish_term')).world);
      ok('  and it comes back where it was',
        back.year===mid.year&&back.history.length===mid.history.length,
        back.year+', '+back.history.length+' rulings');
    }
  }
  console.log('  errors:', errs.length?errs:'none');
  if(errs.length) bad++;
  await p.close();
}

await b.close();
console.log(bad?'\nFAILURES: '+bad:'\nall clear');
process.exit(bad?1:0);
