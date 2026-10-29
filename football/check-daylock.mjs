/*
 * check-daylock.mjs : a daily lock lets you in when its countdown reaches zero.
 *
 *   node football/check-daylock.mjs
 *
 * WHY THIS EXISTS. Reported by a signed in player, through the feedback form: they finished a
 * Dynasty day 10-7, pressed on, and the spent sheet read 1 second. They closed it, opened it
 * again, and it read 24 hours. Nothing threw. The door just never opened.
 *
 * Two causes, one in each half, and this file drives the page half end to end:
 *
 *   THE PAGE KEPT A LOCK PAST ITS OWN END. The meter is asked once per sign-in and read off a
 *   cache, and nothing retired the cached "3 of 3 used, locked until T" once T had passed. So
 *   the gate stayed shut, the countdown had nothing left to count, and the sheet fell through
 *   to its "24 hours after that" line.
 *
 *   AND THE SERVER STARTED A NEW ONE. A results screen painted off that stale cache reports the
 *   day over again, and ps_attempt_day_end on 105 read an EXPIRED lock as an open window and
 *   stamped a fresh 24 hours on it. The stand-in below is that deployed function, on purpose:
 *   the page has to be right against the database that is live today, before
 *   154_dynasty_day_end_lapsed.sql is run. The SQL half has its own test,
 *   supabase/test/dynasty_day_end_test.sql.
 *
 * ON A FAKE CLOCK, because the bug lives in the last second of a 24 hour wait and nobody is
 * going to sit through one. Playwright's clock moves the page's Date.now, and the stand-in
 * reads the same Date.now, so the browser and the "server" agree to the millisecond. A real
 * skew between the two is a different question and is not what was reported.
 *
 * Like check-premium.mjs it never talks to Supabase or Stripe. Signing in and ownership are set
 * by hand: what is under test is what the PAGE does with the answers.
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
  console.log('Set PS_PLAYWRIGHT to its index.js and PS_CHROME to a browser, or run it in CI.');
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

/* THE HOOKS, injected just above boot(). `meter` is the stand-in for the four ps_attempt*
   functions as 102 and 105 wrote them, keyed on the page's own clock. Its day_end is the
   deployed one: a lock that has run out is closed again with a fresh wait. */
const INJECT = [
  'R:R,dataNow,LEAGUE:()=>LEAGUE,CAL:()=>CAL,getRun:()=>run,setRun:(v)=>{run=v;}',
  'dynSave,dynResume,goHome,paintHomeStart,closeSheet,dailyShut,runDayShut,dailyResetsAt',
  'setPremium:(v)=>{premiumSet=v;},setDaily:(m,v)=>{dailyState[m]=v;},getDaily:(m)=>dailyState[m]',
  'setRunDay:(v)=>{runDayState=v;}','spend:(m)=>B.attemptSpend(m)',
  'markAsked:()=>{dailyAsked={dynasty:true,trade:true,full:true};runDayAsked=true;}',
  "signIn:()=>{authState=Object.assign({},authState,{ready:true,signedIn:true,userId:'u-test',name:'tester'});}",
  'meter:(used)=>{const W=864e5,A=3,row={used:used,locked:null,fired:false},n={stamps:0,ends:0};'
    + 'const open=()=>({used:0,allowance:A,resetsAt:null,unit:"season",ended:false});'
    + 'const view=()=>{if(row.locked!=null&&row.locked<=Date.now())return open();'
    + 'if(row.locked!=null)return {used:A,allowance:A,resetsAt:new Date(row.locked).toISOString(),unit:"season",ended:row.fired};'
    + 'return {used:row.used,allowance:A,resetsAt:null,unit:"season",ended:false};};'
    + 'B.attemptsState=async()=>view();'
    + 'B.attemptSpend=async()=>{if(row.locked!=null&&row.locked>Date.now())return Object.assign({ok:false},view());'
    + 'if(row.locked!=null){row.used=0;row.locked=null;row.fired=false;}'
    + 'if(row.used>=A)return Object.assign({ok:false},view());row.used++;return Object.assign({ok:true},view());};'
    + 'B.attemptGrace=async()=>view();'
    + 'B.attemptDayEnd=async(m,f)=>{n.ends++;if(row.locked==null||row.locked<=Date.now()){'
    + 'row.locked=Date.now()+W;row.fired=!!f;n.stamps++;}return view();};'
    + 'B.dynRunState=async()=>({ok:true,pro:false,nextAt:null});'
    + 'B.dynRunStart=async()=>({ok:true,pro:false,nextAt:null});'
    + 'return {n:n,row:row};}',
].join(',');

async function openPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.clock.install({ time: new Date('2026-10-19T21:30:00Z') });
  await page.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    let body = fs.readFileSync(f);
    if (rel === '/football/index.html') {
      const s = body.toString('utf8');
      if (s.indexOf('\nboot();') < 0) throw new Error('no boot() anchor to inject at');
      body = Buffer.from(s.replace('\nboot();', '\nwindow.__t={' + INJECT + '};\nboot();'), 'utf8');
    }
    await r.fulfill({ status: 200,
      contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
  });
  await page.goto('http://local.test/football/', { waitUntil: 'domcontentloaded' });
  await page.clock.runFor(5000);
  return { page, boom };
}

const sheetOn = (page) => page.evaluate(() => {
  const sh = document.getElementById('sheet');
  return !!(sh && sh.classList.contains('on'));
});
const sheetText = (page) => page.evaluate(() =>
  (document.getElementById('sheet-in').innerText || '').replace(/\s+/g, ' ').trim());
const screen = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(','));

/* The way out of the results screen, the way a thumb takes it. The mandate has a beat of its
   own in front of the winter; a boss would buy a season and is not this bug, so a seed that
   draws one is reported rather than worked round. */
async function pressOn(page) {
  const label = await page.evaluate(() => {
    const b = document.getElementById('b-next-season');
    return b ? b.textContent : '';
  });
  if (/^Face /.test(label)) throw new Error('this seed drew a boss battle: pick another');
  await page.click('#b-next-season');
  await page.clock.runFor(400);
  if ((await screen(page)).includes('s-mbrief')) {
    await page.click('#b-mb-go');
    await page.clock.runFor(400);
  }
}

const browser = await pw.chromium.launch({ executablePath: CHROME });

console.log('A DYNASTY DAY UNLOCKS WHEN ITS COUNTDOWN ENDS');
{
  const { page, boom } = await openPage(browser, { width: 1536, height: 695 });
  /* A signed in free account, two seasons already played today, a run drafted and its third
     season played to the results screen through run.js, saved, and resumed the way the front
     page's door does it. */
  const setup = await page.evaluate(() => {
    const T = window.__t;
    T.signIn(); T.setPremium([]); T.markAsked();
    const srv = T.meter(2);
    window.__srv = srv;
    T.setDaily('dynasty', { used: 2, allowance: 3, resetsAt: null, unit: 'season', ended: false });
    const R = T.R, D = T.dataNow();
    const run = R.createRun({ dynasty: true, seed: 20261019 });
    let guard = 0;
    while (run.roster.length < run.slots.length && guard++ < 300) {
      const draw = R.spin(run, D);
      const men = R.affordableFrom(run, draw.team_season_id, D.playersByTeamSeason);
      if (!men.length) continue;
      const share = R.remaining(run) / Math.max(1, run.slots.length - run.roster.length) * 1.6;
      const within = men.filter((p) => p.price_musd <= share);
      const want = (within.length ? within : men).slice()
        .sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
      R.sign(run, want, R.slotChoices(run, want)[0]);
    }
    T.setRun(run);
    /* The kickoff charges the third season, the same call startSeason makes. */
    run.paidSeason = run.seasonNo || 1; run.attemptPaid = true;
    return T.spend('dynasty').then((s) => {
      T.setDaily('dynasty', s);
      R.startSeason(run, D, T.CAL());
      guard = 0;
      while (run.phase !== R.PHASES.OVER && guard++ < 60) {
        if (run.phase === R.PHASES.SEEDING) {
          if (run.playoffSeed.made) R.startPlayoffs(run); else break;
          continue;
        }
        R.advanceWeek(run, D, T.LEAGUE(), T.CAL());
      }
      T.dynSave();
      return { phase: run.phase, fired: !!run.fired, used: srv.row.used,
        record: run.season && run.season.wins != null ? run.season.wins + '-' + run.season.losses : '' };
    });
  });
  ok('a free account plays its third season to the results screen',
    setup.phase === 'over' && setup.used === 3 && !setup.fired,
    setup.phase + ' used=' + setup.used + (setup.fired ? ' fired' : '') + ' ' + setup.record);

  await page.evaluate(() => window.__t.dynResume('open'));
  await page.clock.runFor(2000);
  const stamped = await page.evaluate(() => ({
    stamps: window.__srv.n.stamps, at: window.__t.dailyResetsAt('dynasty') }));
  ok('the results screen ends the day and the clock starts', stamped.stamps === 1 && !!stamped.at,
    'stamps=' + stamped.stamps);

  /* Pressed on with the clock running: the sheet, with 24 hours on it. */
  await pressOn(page);
  const first = await sheetText(page);
  ok('pressing on opens the spent sheet with the countdown', /unlocks in 23h 59m|unlocks in 24h/.test(first),
    first.slice(0, 90));
  await page.evaluate(() => window.__t.closeSheet());

  /* Forward to one second before the end, and ask again. */
  const left = await page.evaluate(() => window.__t.dailyResetsAt('dynasty') - Date.now());
  await page.clock.fastForward(left - 1000);
  await pressOn(page);
  const last = await sheetText(page);
  ok('one second before the end it says 1s', /unlocks in 1s/.test(last), last.slice(0, 90));
  await page.evaluate(() => window.__t.closeSheet());

  /* Past the end, closed and opened again. This is the report. */
  await page.clock.fastForward(2000);
  await pressOn(page);
  const after = { on: await sheetOn(page), text: await sheetText(page), screen: await screen(page) };
  const relocked = await page.evaluate(() => window.__srv.n.stamps);
  ok('past the end, pressing on goes into the offseason',
    !after.on && /s-winter/.test(after.screen),
    (after.on ? 'sheet: ' + after.text.slice(0, 90) : 'screen ' + after.screen));
  ok('and never says 24 hours again', !(after.on && /24 hours|24h/.test(after.text)));
  ok('and the server was not asked for a second lock', relocked === 1, 'stamps=' + relocked);

  /* THE OTHER WAY BACK IN: the front page door, then the saved results screen. A page holding
     the stale lock repaints that screen, reports the day over again, and the deployed server
     answers with a fresh 24 hours. */
  await page.evaluate(() => { window.__t.goHome(); window.__t.paintHomeStart(); });
  await page.clock.runFor(600);
  const door = await page.evaluate(() => {
    const el = document.querySelector('#b-start-dyn .hp-full-sub');
    return el ? el.textContent : '';
  });
  ok('the front page door no longer counts down', !/ in \d|24 hours/.test(door), door);
  await page.evaluate(() => window.__t.dynResume('open'));
  await page.clock.runFor(1500);
  const again = await page.evaluate(() => ({ stamps: window.__srv.n.stamps,
    shut: window.__t.dailyShut('dynasty') }));
  ok('resuming the finished run does not lock the new day', again.stamps === 1 && !again.shut,
    'stamps=' + again.stamps + ' shut=' + again.shut);
  ok('no page errors', !boom.length, boom.join(' | '));
  await page.close();
}

console.log('\nTHE OTHER DAILY LOCKS RETIRE THE SAME WAY');
/*
 * THE SAME CACHE, THE SAME GATE. The Trade Machine and Full Team are on the Eastern calendar
 * day and their resetsAt is the next midnight; the one-new-dynasty meter (106) caches a
 * refusal with a nextAt. Each of them stayed shut past its own time for the same reason. These
 * are read straight off the gates rather than walked, because the walk above already proves
 * the gate is what the screens ask.
 */
{
  const { page, boom } = await openPage(browser, { width: 390, height: 844 });
  const r = await page.evaluate(async () => {
    const T = window.__t;
    T.signIn(); T.setPremium([]); T.markAsked();
    const soon = new Date(Date.now() + 1000).toISOString();
    const out = {};
    for (const m of ['trade', 'full']) {
      T.setDaily(m, { used: 1, allowance: 1, resetsAt: soon, unit: 'run', ended: false });
    }
    T.setRunDay({ ok: false, pro: false, nextAt: soon });
    out.before = { trade: T.dailyShut('trade'), full: T.dailyShut('full'), run: T.runDayShut() };
    return out;
  });
  await page.clock.fastForward(5000);
  const after = await page.evaluate(() => {
    const T = window.__t;
    return { trade: T.dailyShut('trade'), full: T.dailyShut('full'), run: T.runDayShut() };
  });
  ok('the Trade Machine is shut before midnight', r.before.trade === true);
  ok('and open after it', after.trade === false);
  ok('Full Team is shut before midnight', r.before.full === true);
  ok('and open after it', after.full === false);
  ok('a new dynasty is shut before its time', r.before.run === true);
  ok('and open after it', after.run === false);
  ok('no page errors', !boom.length, boom.join(' | '));
  await page.close();
}

await browser.close();
console.log('\n' + (fails ? fails + ' FAILED' : 'all ok'));
process.exit(fails ? 1 : 0);
