/* What the economy promises is what it pays (the Golf Economy Agent's, owner calls of 2026-10-16).
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-payouts.mjs
 *
 *   WEEKLY    every weekly challenge done pays its Mulli-Spin, as the Challenges screen says
 *   LIFETIME  the coin achievements count every coin earned: spending and bought coins never move them
 *   H2H       Head to Head win coins stop at H2H_COIN_DAY_CAP a day, and start again the next day
 *   PUTT      the Putt Putt Daily card names the most the Daily Hole pays
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = process.env.HOST || 'http://localhost:8099';
const DIR = path.dirname(fileURLToPath(import.meta.url));
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 260) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const b = await chromium.launch();
const errs = [];
try {
  const page = await b.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.route(/supabase|googlesyndication|google-analytics|googletagmanager|jsdelivr/, (r) => r.abort());
  await page.goto(HOST + '/golf/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof questWeekly === 'function' && typeof lifetimeCoinsEarned === 'function', null, { timeout: 30000 });
  const R = await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
    sbUser = { id: 'payouts', email: 'p@example.com' }; sbUsername = 'payouts';
    try { cloudPush = function () {}; } catch (e) {} try { toast = function () {}; } catch (e) {} try { track = function () {}; } catch (e) {}
    const out = {};
    // WEEKLY: finish each of the week's challenges by feeding its metric
    const m0 = mulliSpins(), set = weeklySet();
    set.forEach((c) => { questWeekly(c.metric, c.target); });
    out.weekly = { n: set.length, done: weekChalDoneCount(), mulli: mulliSpins() - m0, per: WEEKLY_MULLI };
    out.copy = /mulli-spin/i.test(document.documentElement.innerHTML);
    // LIFETIME: earning moves it, spending does not
    const l0 = lifetimeCoinsEarned(); addBonusCoins(5000, { silent: true }); const l1 = lifetimeCoinsEarned();
    coinCharge(3000, 'check'); const l2 = lifetimeCoinsEarned();
    const ach = ACH.find((a) => a.id === 'coin_10m'); const a5 = ACH.find((a) => a.goal === 5000 && /coin/.test(a.id));
    out.life = { earn: l1 - l0, afterSpend: l2 - l1, ten: ach && ach.get(), five: a5 && a5.get(), lt: l2 };
    // H2H: the cap, then a new day
    const keep = todayKey; const pays = []; let day1 = 0;
    todayKey = () => 20261016; for (let i = 0; i < 400; i++) { const c = h2hWinCoins(); day1 += c; if (i < 2 || c === 0 && pays.length < 3) pays.push(c); }
    todayKey = () => 20261017; const next = h2hWinCoins(); todayKey = keep;
    out.h2h = { day1, cap: H2H_COIN_DAY_CAP, win: COIN_H2H_WIN, next, pays };
    return out;
  });

  head('WEEKLY: each weekly challenge pays its Mulli-Spin');
  ok('all ' + R.weekly.n + ' of the week\'s challenges finished', R.weekly.done === R.weekly.n, R.weekly);
  ok('each paid ' + R.weekly.per + ' Mulli-Spin', R.weekly.mulli === R.weekly.n * R.weekly.per, R.weekly);

  head('LIFETIME: the coin achievements count every coin earned');
  ok('earning 5,000 moves lifetime earnings by 5,000', R.life.earn === 5000, R.life);
  ok('spending 3,000 does not move it', R.life.afterSpend === 0, R.life);
  ok('"Earn 10,000,000 coins" reads lifetime earnings', R.life.ten === Math.round(R.life.lt), R.life);

  head('H2H: win coins stop at the daily cap');
  ok('a day of wins pays exactly the cap (' + R.h2h.cap + ')', R.h2h.day1 === R.h2h.cap, R.h2h);
  ok('the next day pays a full win again (' + R.h2h.win + ')', R.h2h.next === R.h2h.win, R.h2h);

  head('PUTT: the Daily card says what the Daily Hole pays');
  const putt = fs.readFileSync(path.join(DIR, 'putt', 'putt.js'), 'utf8');
  ok('the card reads COIN_DAILY + COIN_DAILY_PAR, the most a round pays', /'Up to ' \+ \(COIN_DAILY \+ COIN_DAILY_PAR\) \+ ' coins'/.test(putt));
  ok('and the round pays COIN_DAILY, plus COIN_DAILY_PAR under par', /COIN_DAILY \+ \(s < par \? COIN_DAILY_PAR : 0\)/.test(putt));

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
} finally { await b.close(); }
console.log(bad ? '\n' + bad + ' failed' : '\nall passed');
process.exit(bad ? 1 : 0);
