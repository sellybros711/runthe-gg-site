/* THE TERM AND THE CAREER BELONG TO THE ACCOUNT, NOT TO THE BROWSER.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_cloudsave.mjs
 *
 * EVERY FAILURE THIS CATCHES IS SILENT, which is why it is worth a browser. Nothing throws
 * when a save is not uploaded. Nothing throws when a stale copy lands on a newer one. The
 * only symptom is a commissioner four years into a term arriving at a door offering them the
 * job, and by then the term is gone and there is nothing to debug.
 *
 * THE STAND-IN KEEPS THE SAME RULE AS THE SQL. supabase/103_cloud_saves.sql refuses a write
 * that would move a save backwards and hands back what is stored; so does the shelf below. If
 * those two ever disagree this file is testing a server nobody runs, so the rule is written
 * out here in one place and pointed at 103 rather than reimplemented in pieces.
 *
 * WHAT IS DELIBERATELY NOT MOCKED is the page. Every walk is through the real gate, the real
 * save() and the real newTerm(), because the whole class of bug here is wiring: a save that
 * writes locally and never queues an upload passes every unit test ever written for it.
 */
import { chromium } from 'playwright';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../../../..');
const UID = '11111111-1111-1111-1111-111111111111';
const URL = 'http://localhost:8080/cfb/commish/index.html';
const TESTER = 'commish-test-account';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* The same trap test_page.mjs uses: put a name on the REAL list by intercepting the
   assignment access.js makes, so the gate walked here is the shipped gate. */
const arm = (name) => `
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify(name)}); }catch(e){} }});
})();`;

const auth = (signedIn) => `
window.supabase={createClient(){
  const session=${signedIn}?{access_token:'save-test-token',user:{id:'${UID}',email:'c@e.com'}}:null;
  return {auth:{onAuthStateChange(){return{data:{}}},
    getSession:()=>Promise.resolve({data:{session}}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:{username:'${TESTER}'}})}}}}}},
    rpc:(fn)=>Promise.resolve(fn==='premium_products'
      ? {data:['cfb_premium'],error:null}
      : {data:true,error:null})}}};`;

/*
 * THE SHELF, IN THE PAGE, SEEDED AND READABLE.
 *
 * Installed as a fetch trap rather than a route handler so the test can read what is stored
 * at any moment and seed it before the page boots, which is what "another device played
 * further" means here. It answers the four functions 103 defines and nothing else; any other
 * Supabase call falls through to the real fetch, which in this harness is the page's own
 * files off the local server.
 */
const shelf = (seed) => `
window.__shelf=${JSON.stringify(seed || {})};
window.__calls=[];
(function(){
  var real=window.fetch.bind(window);
  window.fetch=function(u,o){
    var url=String(u&&u.url||u||'');
    var m=/\\/rest\\/v1\\/rpc\\/(ps_save_[a-z]+)$/.exec(url);
    if(!m) return real(u,o);
    var fn=m[1];
    var body={};
    try{ body=JSON.parse((o&&o.body)||'{}'); }catch(e){}
    window.__calls.push({fn:fn,slot:body.p_slot,progress:body.p_progress});
    var key=body.p_game+'/'+body.p_slot;
    var out;
    if(fn==='ps_save_get'){
      out=window.__shelf[key]?[window.__shelf[key]]:[];
    }else if(fn==='ps_save_all'){
      out=Object.keys(window.__shelf).filter(function(k){
        return k.indexOf(body.p_game+'/')===0;
      }).map(function(k){ return window.__shelf[k]; });
    }else if(fn==='ps_save_drop'){
      delete window.__shelf[key];
      out=true;
    }else{
      /* THE RULE, AND IT IS THE ONE IN 103: a write that would move a save backwards is
         refused, and the answer carries what is stored so the caller can adopt it. */
      var have=window.__shelf[key];
      if(have&&have.progress>body.p_progress){
        out=[{ok:false,slot:have.slot,progress:have.progress,payload:have.payload,
          saved_at:have.saved_at}];
      }else{
        window.__shelf[key]={slot:body.p_slot,progress:body.p_progress,
          payload:body.p_payload,saved_at:new Date().toISOString()};
        out=[Object.assign({ok:true},window.__shelf[key])];
      }
    }
    return Promise.resolve(new Response(JSON.stringify(out),
      {status:200,headers:{'Content-Type':'application/json'}}));
  };
})();`;

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

const open = async (init) => {
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(init);
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2600);
  return { p, errs };
};
const on = (p, id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
const tap = async (p, sel) => { try { await p.click(sel, { timeout: 2000 }); return true; } catch (e) { return false; } };
const quiet = async (p) => {
  for (let i = 0; i < 40; i++) {
    const idle = await p.evaluate(() => !window.RTG_SAVE || window.RTG_SAVE.idle()).catch(() => true);
    if (idle) return true;
    await p.waitForTimeout(120);
  }
  return false;
};

console.log('\n=== the client is on the page at all ===');
{
  const { p, errs } = await open(arm(TESTER) + auth(true) + shelf());
  const got = await p.evaluate(() => ({
    there: !!window.RTG_SAVE,
    api: window.RTG_SAVE && window.RTG_SAVE.API_VERSION,
    signedIn: !!(window.RTG_SAVE && window.RTG_SAVE.signedIn()),
  }));
  ok('cloudsave.js loads', got.there === true);
  ok('and finds the college game\'s session', got.signedIn === true);
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await p.close();
}

console.log('\n=== taking the job puts the term on the account ===');
{
  const { p, errs } = await open(arm(TESTER) + auth(true) + shelf());
  ok('the door opened for a paid tester', await on(p, 's-gate'));
  await tap(p, '#g-start');
  await p.waitForTimeout(1200);
  await quiet(p);
  const up = await p.evaluate(() => {
    const row = window.__shelf['cfb_commish/term'];
    return { there: !!row, year: row && row.payload && row.payload.world && row.payload.world.year,
      progress: row && row.progress };
  });
  ok('the term is uploaded without anybody asking', up.there === true);
  ok('and it is the world that was just created', up.year === 2025, String(up.year));
  ok('carrying how far along it is', up.progress >= 1, String(up.progress));
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await p.close();
}

console.log('\n=== a browser with nothing on it is handed the account\'s term ===');
{
  /* ANOTHER DEVICE PLAYED FOUR YEARS. This browser has never seen the mode. The whole point
     of the exercise is that the door offers to resume rather than to take the job. */
  const seeded = {
    'cfb_commish/term': { slot: 'term', progress: 61, saved_at: new Date().toISOString(),
      payload: { v: 1, world: null } },
  };
  /* Built from a real term rather than by hand: a world this page cannot open is refused by
     load(), and a hand-written one would test the refusal instead of the sync. */
  const { p: p0 } = await open(arm(TESTER) + auth(true) + shelf());
  await tap(p0, '#g-start');
  await p0.waitForTimeout(1200);
  await quiet(p0);
  const world = await p0.evaluate(() => {
    const row = window.__shelf['cfb_commish/term'];
    return row && row.payload;
  });
  await p0.close();
  seeded['cfb_commish/term'].payload = world;

  const { p, errs } = await open(arm(TESTER) + auth(true) + shelf(seeded));
  await p.waitForTimeout(2200);
  const door = await p.evaluate(() => {
    const act = document.getElementById('gate-act');
    return { text: ((act && act.innerText) || '').replace(/\s+/g, ' '),
      local: !!localStorage.getItem('cfb_commish_term') };
  });
  ok('the term came down into this browser', door.local === true);
  ok('and the door offers it back rather than the job',
    /Back to /i.test(door.text), door.text.slice(0, 80));
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await p.close();
}

console.log('\n=== a term further on is never overwritten by one behind it ===');
{
  const seeded = {
    'cfb_commish/term': { slot: 'term', progress: 9999, saved_at: new Date().toISOString(),
      payload: { v: 1, world: { version: 1, year: 2031, seed: 1, rngCalls: 0, history: [] } } },
  };
  const { p, errs } = await open(arm(TESTER) + auth(true) + shelf(seeded));
  await tap(p, '#g-start');
  await p.waitForTimeout(1200);
  await quiet(p);
  const after = await p.evaluate(() => {
    const row = window.__shelf['cfb_commish/term'];
    return { progress: row && row.progress, year: row && row.payload && row.payload.world && row.payload.world.year };
  });
  /* THE NEW TERM WINS, and it must, because taking the job DELETES first. Without that
     delete the write would be refused as going backwards and the next sign in on another
     device would hand back the term this player had just walked away from. */
  ok('taking the job clears the shelf before writing to it',
    after.year === 2025 && after.progress < 9999, after.year + ' @ ' + after.progress);
  const order = await p.evaluate(() => window.__calls
    .filter((c) => c.slot === 'term').map((c) => c.fn).join(','));
  ok('and the delete goes out before the first save',
    /ps_save_drop.*ps_save_put/.test(order) || /^ps_save_all,ps_save_drop/.test(order), order);
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await p.close();
}

console.log('\n=== the career is its own slot, and it is the half that cannot be replayed ===');
{
  const seeded = {
    'cfb_commish/career': { slot: 'career', progress: 300041, saved_at: new Date().toISOString(),
      payload: { v: 1, rulings: 40, terms: [{ year: 2025 }, { year: 2030 }, { year: 2035 }] } },
  };
  const { p, errs } = await open(arm(TESTER) + auth(true) + shelf(seeded));
  await p.waitForTimeout(2200);
  const got = await p.evaluate(() => {
    let c = null;
    try { c = JSON.parse(localStorage.getItem('cfb_commish_career') || 'null'); } catch (e) {}
    return { rulings: c && c.rulings, terms: c && c.terms && c.terms.length };
  });
  ok('three terms of service came down with the account', got.terms === 3, String(got.terms));
  ok('and the ruling count with them', got.rulings === 40, String(got.rulings));
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await p.close();
}

console.log('\n=== a shelf that cannot be reached is never the reason a term goes ===');
{
  /* EVERY CALL FAILS SOFT, and this is the assertion that matters most: the mode has to be
     exactly as playable with the network on fire as it was before any of this existed. */
  const dead = `
    (function(){ var real=window.fetch.bind(window);
      window.fetch=function(u,o){
        var url=String(u&&u.url||u||'');
        if(/\\/rest\\/v1\\/rpc\\/ps_save_/.test(url)) return Promise.reject(new Error('down'));
        return real(u,o);
      };
    })();`;
  const { p, errs } = await open(arm(TESTER) + auth(true) + dead);
  ok('the door still opens', await on(p, 's-gate'));
  await tap(p, '#g-start');
  await p.waitForTimeout(1400);
  const local = await p.evaluate(() => !!localStorage.getItem('cfb_commish_term'));
  ok('and a term still starts and still saves in this browser', local === true);
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await p.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' failed' : '\nall cloud save checks passed');
process.exit(bad ? 1 : 0);
