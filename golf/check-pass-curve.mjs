/* The Tour Pass climb, with no daily limit: an even curve, a lower XP rate, and Daily replays that pay no XP.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-pass-curve.mjs
 *
 *   CURVE     v6: tier 1 costs 800 and tier 60 2,000, about 84,000 in all; overtime tiers cost 2,000
 *   BRIEFS    a sponsor brief feeds the Track at the season rate, like the season it is part of
 *   SIMMED    a season simmed to the end (Skip to end), and any brief it settles, pays coins and no Pass XP
 *   NO LIMIT  an award lands on the track in full, whatever the day
 *   REPLAYS   Daily rounds 1 to 3 pay Pass XP; round 4 on (unlimited plays, tokens) pays coins and no XP
 *   MIGRATION a v4 player keeps their tier; XP banked while the day pace was live comes back once, at the
 *             new rate, and a second device holding the old bank cannot pay it again
 *   PACE      a decent season is 2,500 season coins and four 700 coin briefs (about 640 XP). Three of those
 *             and three Daily rounds a day finishes in the high 30s; two a day around day 50 to 55; one season
 *             and one round a day is still climbing in the high 30s at day 60 (double XP weekends included)
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST || 'http://localhost:8099';
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 240) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const b = await chromium.launch();
const errs = [];
try {
  const page = await b.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.clock.setSystemTime(new Date('2026-10-12T16:00:00Z'));
  await page.goto(HOST + '/golf/index.html');
  await page.waitForFunction(() => typeof passAddXp === 'function');
  const R = await page.evaluate(() => {
    sbUser = { id: 'curve', email: 'x@example.com' };
    try { cloudPush = function () {}; } catch (e) {}
    try { toast = function () {}; } catch (e) {}
    try { wkNote = function () {}; } catch (e) {}
    const real = todayKey, out = {};
    const keyOf = (day) => { const d = new Date(Date.UTC(2026, 9, 4 + day)); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
    const fresh = (st) => { try { localStorage.clear(); } catch (e) {} if (st) LS.set(acctKey('bag_tourpass'), st); S._passPop = null; };
    out.curve = { v: PASS_CURVE_V, total: passXpForTier(PASS_TIERS), t1: passTierCost(1), t60: passTierCost(PASS_TIERS), ot: PASS_OT_COST, rate: PASS_XP_RATE };
    // no limit: a big award on day 1 lands in full
    todayKey = () => keyOf(1); fresh(); passAddXp(20000); out.big = passState().xp;
    // replays
    out.replay = [0, 1, 2, 3, 7].map((a) => { S.dailyAttempt = a; return dailyRoundPaysPassXp(); });
    todayKey = () => keyOf(8); fresh(); const c0 = coinBalance(), x0 = passState().xp;
    awardPlayCoins(300, 'test', 0, true); out.coinsOnly = { coins: coinBalance() - c0, xp: passState().xp - x0 };
    // migration: a v4 player at tier 6 (718 XP) with 1,000 XP banked
    const v4 = (t) => { let x = 0; for (let i = 1; i <= t; i++) x += 95 + 2 * (i - 1) + 0.38 * (i - 1) * (i - 1); return Math.round(x); };
    const v4tier = (xp) => { let t = 0; while (t < 60 && xp >= v4(t + 1)) t++; return t; };
    fresh({ season: 2, xp: 718, bank: 1000, grand: 600, paceV: 1, curveV: 4, pro: false, claimed: { free: [], prem: [] } });
    let s = passState(); out.mig = { tier: passTierAt(s.xp), want: v4tier(718 + 500), bank: s.bank, grand: s.grand, paceV: s.paceV, curveV: s.curveV };
    const after = passState().xp; out.mig.again = passState().xp === after;
    const old = { season: 2, xp: 718, bank: 1000, paceV: 1, curveV: 4, pro: false, claimed: { free: [], prem: [] } };
    const m = mergeTourPass(passState(), old); LS.set(acctKey('bag_tourpass'), m); out.mig.merged = passState().xp === after;
    fresh({ season: 2, xp: v4(30) + 10, paceV: 2, curveV: 4, pro: false, claimed: { free: [], prem: [] } });
    out.conv30 = passTierAt(passState().xp);
    // the pace, from the real faucets (holiday double XP included)
    const season1 = () => { awardPlayCoins(2500, 'season', PASS_XP_SEASON, true); for (let i = 0; i < 4; i++) awardPlayCoins(700, 'brief', PASS_XP_SEASON, true); };
    fresh(); season1(); out.decent = passState().xp;
    const play = (seasons, dailies, days) => { fresh(); let done = null;
      for (let d = 1; d <= days; d++) { todayKey = () => keyOf(d); S._passPop = null;
        for (let i = 0; i < seasons; i++) season1(); for (let i = 0; i < dailies; i++) awardPlayCoins(220, 'daily', undefined, true);
        if (done == null && passTierAt(passState().xp) >= PASS_TIERS) done = d; }
      return { done, tier: passTierAt(passState().xp), day1: null }; };
    out.heavy = play(3, 3, 60);
    out.steady = play(2, 3, 60);
    out.casual = play(1, 1, 60);
    const src = [...document.scripts].map((x) => x.textContent).join('\n');
    out.briefRate = /awardPlayCoins\(rw\.coins, b\.brand\+' brief', \(S\.season&&S\.season\.skipped\)\?0:PASS_XP_SEASON/.test(src);
    out.simmed = /awardPlayCoins\(amt, label, skipped\?0:PASS_XP_SEASON\)/.test(src);
    todayKey = () => keyOf(1);
    todayKey = real; return out;
  });
  head('the curve');
  ok(`v6: ${R.curve.total} XP in all, tier 1 at ${R.curve.t1}, tier 60 at ${Math.round(R.curve.t60)}, overtime ${R.curve.ot} a tier`, R.curve.v === 6 && Math.abs(R.curve.total - 84000) < 500 && R.curve.t1 === 800 && Math.abs(R.curve.t60 - 2000) < 5 && R.curve.ot >= R.curve.t60, R.curve);
  ok('play XP is half what it was (0.6 to 0.3)', R.curve.rate === 0.3, R.curve.rate);
  ok('a decent season (about 640 XP) is most of the first tier, not three tiers', R.decent > 500 && R.decent < 800, R.decent);
  ok('a sponsor brief feeds the Track at the season rate, and nothing once the season is simmed', R.briefRate);
  ok('a season simmed to the end (Skip to end) pays no Pass XP', R.simmed);
  head('no daily limit');
  ok('a 20,000 XP award on day 1 lands on the track in full', R.big === 20000, R.big);
  head('Daily replays');
  ok('rounds 1 to 3 pay Pass XP, round 4 on does not', R.replay.join() === 'true,true,true,false,false', R.replay);
  ok('a round that pays no Pass XP still pays its coins', R.coinsOnly.coins > 0 && R.coinsOnly.xp === 0, R.coinsOnly);
  head('migration');
  ok('a v4 player keeps their tier, with the old bank added at half', R.mig.tier === R.mig.want && R.mig.bank === undefined && R.mig.grand === undefined && R.mig.paceV === 2 && R.mig.curveV === 6, R.mig);
  ok('the bank is paid once, even when an old device syncs it back', R.mig.again && R.mig.merged, R.mig);
  ok('tier 30 on v4 is tier 30 on v6', R.conv30 === 30, R.conv30);
  head('the pace');
  ok('three seasons and three Daily rounds a day finishes in the high 30s', R.heavy.done >= 34 && R.heavy.done <= 42, R.heavy);
  ok('two a day finishes around day 50 to 55', R.steady.done >= 48 && R.steady.done <= 58, R.steady);
  ok('one season and one round a day is still climbing at day 60, in the high 30s', R.casual.done === null && R.casual.tier >= 32 && R.casual.tier <= 45, R.casual);
  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
} finally { await b.close(); }
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
