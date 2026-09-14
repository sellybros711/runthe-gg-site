/*
 * check-cloudsave.mjs : a dynasty belongs to the account, checked in a real browser.
 *
 *   node football/check-cloudsave.mjs
 *
 * WHY THIS IS ITS OWN FILE AND ITS OWN BROWSER. Every failure here is silent. A save that
 * writes to localStorage and never queues an upload passes every test anybody would think to
 * write for it, because locally it works perfectly: the run is there on the next visit, on
 * that machine, until the day it is not. The only symptom of the bug is a player arriving at
 * a front page that says Start a Dynasty over a run they were forty seasons into, and by then
 * there is nothing left to debug.
 *
 * THE STAND-IN KEEPS THE SAME RULE AS THE SQL. supabase/103_cloud_saves.sql refuses a write
 * that would move a save backwards and hands back what is stored instead; so does the shelf
 * below. The rule is written out once here and pointed at 103, because a stand-in that
 * drifted from it would be testing a server nobody runs.
 *
 * NOTHING HERE TOUCHES THE NETWORK. Both the page and the shelf are served from disk, and
 * every Supabase call is answered in the page.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';

let pw;
try { pw = (await import(PW)).default; } catch (e) {
  console.log('Playwright is not available here, so this check cannot run.');
  process.exit(0);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};

const UID = '11111111-1111-1111-1111-111111111111';

/*
 * THE SHELF, IN THE PAGE. A fetch trap rather than a route handler, so the test can seed it
 * before boot and read it at any moment: seeding is how "another device played further" is
 * said, and reading is the only way to tell an upload that happened from one that did not.
 */
const SHELF = (seed) => `
window.__shelf=${JSON.stringify(seed || {})};
window.__calls=[];
window.__dead=false;
(function(){
  var real=window.fetch.bind(window);
  window.fetch=function(u,o){
    var url=String(u&&u.url||u||'');
    var m=/\\/rest\\/v1\\/rpc\\/(ps_save_[a-z]+)$/.exec(url);
    if(!m) return real(u,o);
    if(window.__dead) return Promise.reject(new Error('shelf down'));
    var fn=m[1];
    var body={}; try{ body=JSON.parse((o&&o.body)||'{}'); }catch(e){}
    window.__calls.push({fn:fn,slot:body.p_slot,progress:body.p_progress});
    var key=body.p_game+'/'+body.p_slot;
    var out;
    if(fn==='ps_save_get'){
      out=window.__shelf[key]?[window.__shelf[key]]:[];
    }else if(fn==='ps_save_all'){
      out=Object.keys(window.__shelf).filter(function(k){
        return k.indexOf(body.p_game+'/')===0; }).map(function(k){ return window.__shelf[k]; });
    }else if(fn==='ps_save_drop'){
      delete window.__shelf[key]; out=true;
    }else{
      /* THE RULE, AND IT IS THE ONE IN 103. */
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
})();
/* A SESSION, WITHOUT A SUPABASE STUB. cloudsave.js reads PS_AUTH.token() at call time and
   nothing else, so this is the whole of what it needs from an account. Defined before the
   page's own auth.js runs and taken over by it if it loads; the getter keeps this token
   whatever happens, because the shelf above is what is being tested rather than the
   session. */
Object.defineProperty(window,'PS_AUTH',{configurable:true,
  get:function(){ return {token:function(){ return 'save-test-token'; }}; },
  set:function(){}});`;

const INJECT = 'dynCloudPush,dynCloudPull,dynCloudForget,dynClear,dynProgress,dynRead,'
  + 'DYN_SAVE_VERSION,ensureDynastyButton,paintHomeStart,'
  + 'setAuthState:(v)=>{authState=Object.assign({},authState,v);}';

async function openPage(browser, seed) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.addInitScript(SHELF(seed));
  await page.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    let body = fs.readFileSync(f);
    if (rel.endsWith('dynasty-access.js') || rel.endsWith('fullteam-access.js')) {
      body = Buffer.from(body.toString('utf8').replace(/LIVE = false/, 'LIVE = true'), 'utf8');
    }
    if (rel === '/football/index.html') {
      const s = body.toString('utf8');
      if (s.indexOf('\nboot();') < 0) throw new Error('no boot() anchor to inject at');
      body = Buffer.from(s.replace('\nboot();', '\nwindow.__t={' + INJECT + '};\nboot();'), 'utf8');
    }
    await r.fulfill({ status: 200,
      contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
  });
  await page.goto('http://local.test/football/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await page.evaluate((uid) => {
    window.__t.setAuthState({ ready: true, signedIn: true, userId: uid, name: 'tester' });
  }, UID);
  return { page, boom };
}

/* One dynasty, packed the way dynPack packs one, at whatever depth the caller asks for. The
   version is read off the page so a DYN_SAVE_VERSION bump does not quietly turn every
   assertion below into a check that a refused save stays refused. */
const SAVE = (v, seasons, score) => ({
  v: v, api: 1, user: UID, at: Date.now(), submitted: null,
  run: { dynasty: true, phase: 'over', roster: ['x|2019'], seasonNo: seasons + 1,
    score: score == null ? 100 : score,
    history: Array.from({ length: seasons }, (_, i) => ({ year: 2000 + i, wins: 10 })) },
});

const quiet = async (page) => {
  for (let i = 0; i < 50; i++) {
    const idle = await page.evaluate(() => !window.RTG_SAVE || window.RTG_SAVE.idle()).catch(() => true);
    if (idle) return true;
    await page.waitForTimeout(100);
  }
  return false;
};

const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

console.log('THE CLIENT, ON ITS OWN');
{
  const { page, boom } = await openPage(browser);
  const r = await page.evaluate(async () => {
    const S = window.RTG_SAVE;
    const out = {};
    out.there = !!S;
    out.empty = await S.get('ps_dynasty', 'open');
    await S.put('ps_dynasty', 'open', { a: 1 }, 5);
    const back = await S.get('ps_dynasty', 'open');
    out.stored = back && back.payload && back.payload.a;
    out.progress = back && back.progress;
    /* A WRITE THAT WOULD GO BACKWARDS IS REFUSED, and the answer carries what is stored so
       the caller can adopt it rather than guess. */
    const no = await S.put('ps_dynasty', 'open', { a: 2 }, 3);
    out.refused = no && no.ok === false;
    out.kept = no && no.payload && no.payload.a;
    const yes = await S.put('ps_dynasty', 'open', { a: 3 }, 9);
    out.allowed = yes && yes.ok === true && yes.payload.a === 3;
    /* COALESCED. An offseason writes a save on every cut and every signing, and the contract
       is one request in flight per slot and at most one waiting, so a burst of any size costs
       two: the one that went out before anybody else asked, and the newest. What lands is the
       LAST of them, because the payload is built when the wire is free rather than when the
       tap happened. */
    window.__calls.length = 0;
    let q;
    for (let i = 1; i <= 6; i++) {
      q = S.queue('ps_dynasty', 'club', ((n) => () => ({ payload: { n: n }, progress: n }))(i));
    }
    await q;
    out.puts = window.__calls.filter((c) => c.slot === 'club' && c.fn === 'ps_save_put').length;
    const club = await S.get('ps_dynasty', 'club');
    out.last = club && club.payload && club.payload.n;
    /* A DELETE GOES THROUGH THE SAME QUEUE, so a save queued behind it cannot land first and
       leave the row it was meant to remove sitting there. */
    S.queue('ps_dynasty', 'club', () => ({ payload: { n: 4 }, progress: 4 }));
    await S.drop('ps_dynasty', 'club');
    out.gone = !(await S.get('ps_dynasty', 'club'));
    return out;
  });
  ok('the module is there', r.there === true);
  ok('an empty slot answers nothing rather than throwing', r.empty === null);
  ok('a save goes up and comes back', r.stored === 1 && r.progress === 5,
    r.stored + ' @ ' + r.progress);
  ok('a write that would go backwards is refused', r.refused === true);
  ok('and the refusal hands back what is stored', r.kept === 1, String(r.kept));
  ok('a write that goes forwards is taken', r.allowed === true);
  ok('six saves in one tick cost two requests, not six', r.puts === 2, String(r.puts));
  ok('and the one that lands is the newest of them', r.last === 6, String(r.last));
  ok('a delete is ordered against the saves around it', r.gone === true);
  ok('no page errors', boom.length === 0, boom.join(' | '));
  await page.close();
}

console.log('\nTHE RUN THIS BROWSER HAS, PUT ON THE ACCOUNT');
{
  const { page, boom } = await openPage(browser);
  const r = await page.evaluate(async (S) => {
    const T = window.__t;
    localStorage.setItem('ps_dynasty_save', JSON.stringify(
      Object.assign({}, S, { v: T.DYN_SAVE_VERSION })));
    T.dynCloudPush('open');
    await new Promise((res) => setTimeout(res, 50));
    return { progress: T.dynProgress(JSON.parse(localStorage.getItem('ps_dynasty_save')).run) };
  }, SAVE(0, 6, 402500));
  await quiet(page);
  const up = await page.evaluate(() => {
    const row = window.__shelf['ps_dynasty/open'];
    return { there: !!row, seasons: row && row.payload.run.history.length,
      progress: row && row.progress };
  });
  ok('the dynasty is uploaded', up.there === true);
  ok('with every season of it', up.seasons === 6, String(up.seasons));
  ok('and how far along it is', up.progress === r.progress && up.progress > 6,
    up.progress + ' vs ' + r.progress);
  ok('no page errors', boom.length === 0, boom.join(' | '));
  await page.close();
}

console.log('\nA BROWSER WITH NOTHING ON IT IS HANDED THE ACCOUNT\'S RUN');
{
  /* THE WHOLE POINT. Site data cleared, a new phone, a private window that ended: this
     browser has never seen the run and the front page still has to offer it back. */
  const { page: seedPage } = await openPage(browser);
  const version = await seedPage.evaluate(() => window.__t.DYN_SAVE_VERSION);
  await seedPage.close();
  const payload = SAVE(version, 9, 619500);
  const { page, boom } = await openPage(browser, {
    'ps_dynasty/open': { slot: 'open', progress: 200, saved_at: new Date().toISOString(),
      payload: payload },
  });
  const r = await page.evaluate(async () => {
    const T = window.__t;
    try { localStorage.removeItem('ps_dynasty_save'); } catch (e) {}
    T.dynCloudForget();
    await T.dynCloudPull();
    const s = T.dynRead('open');
    const el = document.getElementById('b-start-dyn');
    return { seasons: s && s.run.history.length,
      door: ((el && el.innerText) || '').replace(/\s+/g, ' ').trim() };
  });
  ok('the run came down into this browser', r.seasons === 9, String(r.seasons));
  ok('and the front page offers it back', /Resume Dynasty/i.test(r.door), r.door.slice(0, 70));
  ok('no page errors', boom.length === 0, boom.join(' | '));
  await page.close();
}

console.log('\nTHE COPY WITH MORE PLAY IN IT WINS, IN BOTH DIRECTIONS');
{
  const { page: seedPage } = await openPage(browser);
  const version = await seedPage.evaluate(() => window.__t.DYN_SAVE_VERSION);
  await seedPage.close();
  const { page, boom } = await openPage(browser, {
    'ps_dynasty/open': { slot: 'open', progress: 20, saved_at: new Date().toISOString(),
      payload: SAVE(version, 2, 30000) },
  });
  const r = await page.evaluate(async (local) => {
    const T = window.__t;
    /* THIS BROWSER IS AHEAD: eleven seasons against the account's two. Nothing may come down
       and what is here has to go up, which is the case a last-write-wins rule gets wrong
       roughly half the time and always expensively. */
    localStorage.setItem('ps_dynasty_save', JSON.stringify(
      Object.assign({}, local, { v: T.DYN_SAVE_VERSION })));
    T.dynCloudForget();
    await T.dynCloudPull();
    return { kept: T.dynRead('open').run.history.length };
  }, SAVE(0, 11, 800000));
  await quiet(page);
  const up = await page.evaluate(() => {
    const row = window.__shelf['ps_dynasty/open'];
    return { seasons: row && row.payload.run.history.length };
  });
  ok('the shorter run does not land on the longer one', r.kept === 11, String(r.kept));
  ok('and the longer one is pushed up instead', up.seasons === 11, String(up.seasons));
  ok('no page errors', boom.length === 0, boom.join(' | '));
  await page.close();
}

console.log('\nA RUN THAT REALLY ENDED LEAVES NO ROW BEHIND');
{
  /* DELETED RATHER THAN ZEROED, and that is what makes the progress rule safe: a run written
     over with a fresh one would be refused as going backwards, and the next device would be
     handed the run that was just thrown away. */
  const { page: seedPage } = await openPage(browser);
  const version = await seedPage.evaluate(() => window.__t.DYN_SAVE_VERSION);
  await seedPage.close();
  const { page, boom } = await openPage(browser, {
    'ps_dynasty/open': { slot: 'open', progress: 200, saved_at: new Date().toISOString(),
      payload: SAVE(version, 9, 619500) },
  });
  await page.evaluate(() => window.__t.dynClear('open'));
  await quiet(page);
  const r = await page.evaluate(() => ({
    row: !!window.__shelf['ps_dynasty/open'],
    local: !!localStorage.getItem('ps_dynasty_save'),
  }));
  ok('the account\'s copy goes with the local one', r.row === false && r.local === false,
    'row=' + r.row + ' local=' + r.local);
  ok('no page errors', boom.length === 0, boom.join(' | '));
  await page.close();
}

console.log('\nA SHELF THAT CANNOT BE REACHED IS NEVER THE REASON A RUN GOES');
{
  const { page, boom } = await openPage(browser);
  const r = await page.evaluate(async (local) => {
    const T = window.__t;
    window.__dead = true;
    localStorage.setItem('ps_dynasty_save', JSON.stringify(
      Object.assign({}, local, { v: T.DYN_SAVE_VERSION })));
    T.dynCloudForget();
    await T.dynCloudPull();
    T.dynCloudPush('open');
    await new Promise((res) => setTimeout(res, 400));
    const s = T.dynRead('open');
    return { kept: !!s, seasons: s && s.run.history.length,
      offline: !!(window.RTG_SAVE && window.RTG_SAVE.offline) };
  }, SAVE(0, 4, 90000));
  ok('the local run is untouched', r.kept === true && r.seasons === 4, String(r.seasons));
  ok('and the module says so rather than pretending', r.offline === true);
  ok('no page errors', boom.length === 0, boom.join(' | '));
  await page.close();
}

await browser.close();
console.log(fails ? '\n' + fails + ' failed' : '\nall cloud save checks passed');
process.exit(fails ? 1 : 0);
