/* The Tour Pass season pace: nobody clears the 60 tiers before about day 50, and nothing earned is lost.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-pass-pace.mjs
 *
 *   PACE      the track opens the 60 tiers' XP spread over 50 days; a double XP weekend counts its days twice
 *   BANK      XP earned past today's pace is banked and unlocks on later days, never lost
 *   GRINDER   a player earning far more than the pace finishes on day 48 to 50, not on day 1
 *   COMMITTED a player earning about 780 XP a day finishes in the high 40s
 *   CASUAL    a player earning about 350 XP a day is still climbing at the end, and loses nothing
 *   FLOOR     progress made before the pace existed never goes backwards
 *   OVERTIME  once the 60 tiers are open the pace lifts entirely
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
  await page.clock.setSystemTime(new Date('2026-10-05T16:00:00Z'));
  await page.goto(HOST + '/golf/index.html');
  await page.waitForFunction(() => typeof passAllow === 'function');
  // Day keys of Season 2 (Oct 5 is day 1). todayKey is rebound so a whole season runs in one page.
  const R = await page.evaluate(() => {
    sbUser = { id: 'pace', email: 'x@example.com' };
    try { cloudPush = function () {}; } catch (e) {}
    try { toast = function () {}; } catch (e) {}
    const real = todayKey;
    const keyOf = (day) => { const d = new Date(Date.UTC(2026, 9, 4 + day)); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
    const total = passXpForTier(PASS_TIERS), out = { total, perDay: passPacePerDay() };
    const play = (perDay, days, pre) => {
      try { localStorage.clear(); } catch (e) {}
      if (pre) { todayKey = () => keyOf(1); LS.set(acctKey('bag_tourpass'), { season: 2, xp: pre, pro: false, curveV: PASS_CURVE_V, claimed: { free: [], prem: [] } }); }
      let done = null, tiers = [];
      for (let d = 1; d <= days; d++) { todayKey = () => keyOf(d); S._passPop = null; passAddXp(perDay / PASS_XP_RATE * PASS_XP_RATE);
        const s = passState(); tiers.push(passTierAt(s.xp)); if (done == null && passTierAt(s.xp) >= PASS_TIERS) done = d; }
      const s = passState(); return { done, tier: passTierAt(s.xp), bank: passBank(s), xp: s.xp, t1: tiers[0], t10: tiers[9] };
    };
    // passAddXp applies the holiday multiplier itself, so "perDay" is what the player earns before it
    out.grinder = play(6000, 60);
    out.committed = play(780, 60);
    out.casual = play(350, 60);
    // banking: one huge day, then nothing; it must all arrive by the time the pace opens
    try { localStorage.clear(); } catch (e) {}
    todayKey = () => keyOf(1); S._passPop = null; passAddXp(20000);
    let s = passState(); out.day1 = { xp: s.xp, bank: passBank(s), sum: s.xp + passBank(s) };
    todayKey = () => keyOf(2); s = passState(); out.day2 = { xp: s.xp, bank: passBank(s), sum: s.xp + passBank(s) };
    todayKey = () => keyOf(60); s = passState(); out.day60 = { xp: s.xp, bank: passBank(s) };
    // a double XP weekend opens extra pace: Oct 31 is day 27, the event began Oct 30
    todayKey = () => keyOf(27); out.paceDaysOct31 = passPaceDays();
    todayKey = () => keyOf(25); out.paceDaysOct29 = passPaceDays();
    // the floor: somebody at 2,000 XP before the pace keeps it on day 1
    out.floor = play(0, 1, 2000);
    // overtime: past the opening there is no cap
    try { localStorage.clear(); } catch (e) {}
    todayKey = () => keyOf(55); S._passPop = null; passAddXp(total + 5000); s = passState();
    out.ot = { xp: s.xp, bank: passBank(s), allow: passAllow(s) === Infinity };
    todayKey = real;
    return out;
  });
  head('the pace');
  ok(`the track opens ${R.perDay} XP a day, the whole season's ${R.total} over 50 days`, Math.abs(R.perDay * 50 - R.total) < 60, R);
  ok('a double XP weekend counts its days twice', R.paceDaysOct31 === 27 + 2 && R.paceDaysOct29 === 25, { oct31: R.paceDaysOct31, oct29: R.paceDaysOct29 });
  head('who finishes when');
  ok('a grinder (6,000 XP a day) finishes on day 46 to 50, not on day 1', R.grinder.done >= 46 && R.grinder.done <= 50 && R.grinder.t1 <= 7, R.grinder);
  ok('a committed player (780 XP a day) finishes in the mid to high 40s', R.committed.done >= 44 && R.committed.done <= 52, R.committed);
  ok('a casual player (350 XP a day) is still climbing at the end, with nothing banked', R.casual.done === null && R.casual.tier >= 30 && R.casual.bank === 0, R.casual);
  head('nothing is lost');
  ok('a huge first day is capped at the pace and the rest is banked', R.day1.xp === R.perDay && R.day1.sum === 20000, R.day1);
  ok('the next day opens more of it', R.day2.xp === 2 * R.perDay && R.day2.sum === 20000, R.day2);
  ok('once the pace is fully open the bank is empty', R.day60.bank === 0 && R.day60.xp === 20000, R.day60);
  ok('progress made before the pace is kept', R.floor.xp === 2000, R.floor);
  ok('Overtime is not paced', R.ot.allow && R.ot.bank === 0, R.ot);
  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
} finally { await b.close(); }
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
