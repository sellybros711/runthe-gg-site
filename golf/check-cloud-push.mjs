/* Run The Tour's cloud save: how often the whole bundle goes up, and that leaving never loses it.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-cloud-push.mjs
 *
 * On 2026-11-12 Supabase ran out of Disk IO and every game lost sign-in. runtour_cloud_save_push was the biggest
 * writer left: ~200 KB of WAL a call, 9,449 calls in a day, because ~40 places call cloudPush() and each one sent the
 * whole bundle 1.2 s later, changed or not. A stand-in server here counts and keeps every push, and the page's clock
 * is driven, so a 25 s debounce takes no real time.
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST || 'http://localhost:8099';
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 220) : '')); };

const b = await chromium.launch();
const store = { data:null }, pushes = [];
const errs = [];
async function device(label){
  const ctx = await b.newContext({ viewport:{ width:390, height:844 } }), p = await ctx.newPage();
  p.on('pageerror', e => errs.push(label + ': ' + e.message));
  await p.route(/supabase|googlesyndication|google-analytics|googletagmanager|jsdelivr/, r => r.abort());
  await p.clock.install();
  await p.exposeFunction('__srv', (fn, json) => { const a = json ? JSON.parse(json) : {};
    if (fn === 'runtour_cloud_save_push'){ pushes.push({ label, bytes:JSON.stringify(a.p_data).length }); store.data = a.p_data; return JSON.stringify({ data:true, error:null }); }
    if (fn === 'runtour_cloud_save_pull') return JSON.stringify({ data:store.data ? [{ data:store.data }] : [], error:null });
    return JSON.stringify({ data:null, error:null }); });
  await p.goto(HOST + '/golf/', { waitUntil:'domcontentloaded' });
  await p.waitForFunction(() => typeof cloudPushNow === 'function' && typeof finishDailyRound === 'function', null, { timeout:30000 });
  await p.evaluate(() => { window.sbSignedIn = () => true; sbUser = { id:'u-cloud' }; sbUsername = 'cloudcheck';
    sb = { rpc:(fn, a) => window.__srv(fn, JSON.stringify(a || {})).then(s => JSON.parse(s)), auth:{ signOut:() => Promise.resolve({}) } };
    S.overlay = null; S.screen = 'title'; render(); });
  // the game pulls on sign-in, once the signed-in page has started (its coin wallet and Tour Pass track made for this
  // account). Pulling in the middle of start-up made whether a later open pushed a race of the check's own making.
  await p.clock.runFor(5000);
  return p;
}
const run = async (p, ms) => { await p.clock.runFor(ms); await p.evaluate(() => new Promise(r => setTimeout(r, 0))); };

console.log('\n1. A SESSION IS ONE PUSH, NOT ONE A CHANGE');
const A = await device('A');
await A.evaluate(() => cloudPull()); await run(A, 30000);
ok('a first sign-in with nothing on the server seeds it once', pushes.length === 1, pushes.length);
const n0 = pushes.length;
// a Daily 18 finished, XP, a look change and a quest, each a few seconds apart: about twenty cloudPush() calls
await A.evaluate(() => { S.dailyCourse = Object.keys(DAILY_COURSES)[0]; S.dailySeed = todayKey(); S.dailyOvr = 60; S.dailyCond = 'calm'; S.dailySkills = {}; S.daily = true; S.dailyResult = null;
  S.dailyHoles = Array.from({ length:18 }, (_, i) => ({ n:i + 1, par:4, toPar:i % 3 ? 0 : -1, shots:[] })); finishDailyRound(); });
await run(A, 5000); await A.evaluate(() => addXp(25)); await run(A, 5000);
await A.evaluate(() => { LS.set(lookKey(), Object.assign({}, S.look, { polo:'navy', _ts:Date.now() })); cloudPush(); }); await run(A, 5000);
await A.evaluate(() => questDaily('share')); await run(A, 5000);
ok('changes a few seconds apart wait for each other: nothing has gone up yet', pushes.length === n0, pushes.length - n0);
await run(A, 30000);
ok('once they settle, the whole session goes up as one push', pushes.length === n0 + 1, pushes.length - n0);
await A.evaluate(() => cloudPush()); await run(A, 30000);
ok('a push with nothing changed since the last one is skipped', pushes.length === n0 + 1, pushes.length - n0);

console.log('\n2. LEAVING STILL SAVES AT ONCE');
await A.evaluate(() => addXp(5)); await run(A, 1000);
await A.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value:'hidden', configurable:true }); document.dispatchEvent(new Event('visibilitychange')); });
await run(A, 500);
ok('hiding the tab sends a waiting change straight away', pushes.length === n0 + 2, pushes.length - n0);
await A.evaluate(() => addXp(5)); await run(A, 1000);
await A.evaluate(() => sbSignOut()); await run(A, 500);
ok('signing out sends a waiting change first, while the account can still write it', pushes.length === n0 + 3, pushes.length - n0);
const xpA = JSON.stringify((store.data || {}).xp);

console.log('\n3. ANOTHER DEVICE, AND OPENING THE APP AGAIN');
const B = await device('B'); const pB = pushes.length;
const xpB = await B.evaluate(async () => { await cloudPull(); return JSON.stringify(LS.get(acctKey('bag_xp'), null)); });
ok('a fresh browser for the account gets everything the first one sent', xpB === xpA, [xpA, xpB]);
await run(B, 30000);
// its merge may tidy the copy once (defaults filled in, newer fields added), and that tidied copy goes up
ok('a fresh browser sends the merged copy back at most once', pushes.length - pB <= 1, pushes.length - pB);
const C = await device('C'); const pC = pushes.length;
await C.evaluate(() => cloudPull()); await run(C, 30000);
ok('opening the app again with nothing changed sends nothing (every app open used to send the whole bundle)', pushes.length === pC, pushes.length - pC);

console.log('\n4. THE SAME DAY\'S QUESTS MERGE WITHOUT LOSING ONE');
const mq = await A.evaluate(() => mergeDailyQuests({ day:20261116, daily:1, pass:0, putt:1, xpDone:0 }, { day:20261116, daily:0, pass:1, putttour:1, share:1, xpDone:0 }));
ok('every quest either device did is kept, the newer ones too (Tour Pass tier, both Putt Putt quests)', mq.daily === 1 && mq.pass === 1 && mq.putt === 1 && mq.putttour === 1 && mq.share === 1 && mq.xpDone === 0 && mq.day === 20261116, mq);

ok('no page errors', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
