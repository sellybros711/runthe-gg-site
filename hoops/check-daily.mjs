/* Run The Floor: the daily loop (hoops/daily.js and hoops/daily-ui.js).
 *
 *   node hoops/check-daily.mjs            the rules, then the page
 *   node hoops/check-daily.mjs --quick    the rules only, no browser
 *   SHOT=/tmp/d.png node hoops/check-daily.mjs   and screenshots of the hub
 *
 *  1. The streak counts days in a row, starts again after a miss, and a freeze
 *     earned at 7 bridges one missed day.
 *  2. A streak day pays its slot once, round the seven day track.
 *  3. The login track moves a slot a day and never resets.
 *  4. One free spin a day, banked spins from the tracks and quests; a spin's
 *     prize is decided, paid once, and a Coin Rush adds to the end.
 *  5. The wheel is Run The Tour's: thirteen wedges, a better wheel at every
 *     rank, and the weights are the odds.
 *  6. Quests: the same three and four on every device, an event counts once,
 *     a quest pays once, and all of them pay the bonus.
 *  7. Two devices: the logs merge by union and nothing pays twice.
 *  8. Floor Rep is read off the badges.
 *  9. A Coin Rush doubles what play pays, and only play.
 * 10. The page: the strip, the hub, a spin that stops on the prize it paid,
 *     the streak and the quests, and a daily finished filing its day.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUICK = process.argv.includes('--quick');
global.window = undefined;
const X = require('./economy.js');
const PK = require('./packs.js');
const DY = require('./daily.js');
const WD = require('./wardrobe.js');

let passes = 0, fails = 0;
function ok(c, m){ if (c) { passes++; console.log('  ok ' + m); } else { fails++; console.log('  FAIL ' + m); } }
/* noon Eastern on a day, so the day never slips across midnight */
const T0 = Date.UTC(2026, 9, 5, 16, 0, 0);
const at = (n) => T0 + n * 864e5;
const fresh = () => { const st = WD.fresh(); DY.ensure(st); PK.cleanLogs(st, st); return st; };
function rng(seed){ let s = Math.imul(seed | 0 || 1, 2654435761) >>> 0 || 1; const f = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; for (let i = 0; i < 4; i++) f(); return f; }

/* 1 */
{
  const st = fresh();
  for (let d = 0; d < 5; d++) st.dp[DY.today(at(d))] = [at(d)];
  ok(DY.streak(st, at(4)).cur === 5, '1 five days in a row is a five day streak');
  ok(DY.streak(st, at(5)).cur === 5, '1 the next day it is still alive before playing');
  ok(DY.streak(st, at(6)).cur === 0, '1 two days missed with no freeze ends it');
  st.dp[DY.today(at(7))] = [at(7)];
  ok(DY.streak(st, at(7)).cur === 1, '1 and it starts again');
  ok(DY.streak(st, at(7)).best === 5, '1 the best is kept');
  const f = fresh();
  for (let d = 0; d < 7; d++) f.dp[DY.today(at(d))] = [at(d)];
  ok(DY.streak(f, at(6)).freezes === 1, '1 a freeze is earned on day seven');
  f.dp[DY.today(at(8))] = [at(8)];
  const s = DY.streak(f, at(8));
  ok(s.cur === 8 && s.freezes === 0 && s.bridged.length === 1, '1 a freeze bridges one missed day (' + s.cur + ', ' + s.freezes + ')');
  const g = fresh();
  for (let d = 0; d < 6; d++) g.dp[DY.today(at(d))] = [at(d)];
  g.dp[DY.today(at(7))] = [at(7)];
  ok(DY.streak(g, at(7)).cur === 1, '1 no freeze before day seven, so a miss at six ends it');
  const h = fresh();
  for (let d = 0; d < 110; d++) h.dp[DY.today(at(d))] = [at(d)];
  ok(DY.streak(h, at(109)).freezes === 3, '1 freezes earned at 7, 30 and 100 stop at three');
}

/* 2 */
{
  const st = fresh(), w = X.fresh();
  const r1 = DY.notePlayed(st, w, at(0));
  ok(r1.pos === 1 && r1.got.coins === 150, '2 day one pays 150 coins');
  const again = DY.notePlayed(st, w, at(0) + 3600e3);
  ok(!again.got.coins && X.balance(w) === 150, '2 the same day pays once');
  DY.notePlayed(st, w, at(1));
  ok(PK.shards(st).common === 2, '2 day two gives two common shards');
  DY.notePlayed(st, w, at(2));
  ok(DY.spins(st, at(3)).banked === 1, '2 day three banks a spin');
  DY.notePlayed(st, w, at(3));
  ok(PK.credits(st, 'street').length === 1, '2 day four is a free Streetball Pack');
  for (let d = 4; d < 7; d++) DY.notePlayed(st, w, at(d));
  ok(PK.credits(st, 'league').length === 1, '2 day seven is a free League Pack');
  const d8 = DY.notePlayed(st, w, at(7));
  ok(d8.pos === 1 && d8.got.coins === 150, '2 day eight starts the week again');
}

/* 3 */
{
  const st = fresh(), w = X.fresh();
  const a = DY.noteLogin(st, w, at(0)), b = DY.noteLogin(st, w, at(0) + 5e6);
  ok(a.pos === 1 && a.got.coins === 50 && !b.got.coins && !b.fresh, '3 the first open pays 50, a second open that day nothing');
  DY.noteLogin(st, w, at(1));
  const c = DY.noteLogin(st, w, at(9));
  ok(c.pos === 3 && PK.shards(st).common === 1, '3 a gap does not reset it: the third day opened is slot three');
  for (let d = 10; d < 14; d++) DY.noteLogin(st, w, at(d));
  ok(DY.loginPos(st, DY.today(at(13))) === 7 && PK.credits(st, 'street').length === 2, '3 slots four and seven are Streetball Packs');
}

/* 4 */
{
  const st = fresh(), w = X.fresh();
  ok(DY.spins(st, at(0)).free && DY.spins(st, at(0)).total === 1, '4 a new day has one free spin');
  const r = DY.spin(st, w, 0, { t: at(0), rng: rng(3) });
  ok(!r.err && r.key === 'f:' + DY.today(at(0)), '4 the free spin goes first');
  ok(DY.spin(st, w, 0, { t: at(0) }).err === 'nospin', '4 and then there is none left today');
  st.dg.x = [at(0), 2];
  const before = DY.spins(st, at(0)).banked;
  const b1 = DY.spin(st, w, 0, { t: at(0), rng: rng(4) });
  ok(/^b:/.test(b1.key) && DY.spins(st, at(0)).banked === before - 1 + (b1.prize.kind === 'spin' ? 1 : 0), '4 a banked spin is used after the free one');
  ok(DY.spins(st, at(1)).free, '4 tomorrow is a new free spin');
  /* every kind pays, and pays once */
  let kinds = {};
  for (let i = 0; i < 400; i++) {
    const s2 = fresh(), w2 = X.fresh();
    const x = DY.spin(s2, w2, 10, { t: at(0), rng: rng(100 + i) });
    kinds[x.prize.kind] = 1;
    const paid = x.prize.kind === 'coins' ? X.balance(w2) === x.prize.amt
      : x.prize.kind === 'shard' ? PK.shards(s2)[x.prize.r] === 1
      : x.prize.kind === 'pack' ? PK.credits(s2, x.prize.pack).length === 1
      : x.prize.kind === 'spin' ? DY.spins(s2, at(0)).banked === 1
      : DY.rushUntil(s2) === at(0) + x.prize.mins * 60000;
    if (!paid) { ok(false, '4 a ' + x.prize.kind + ' prize was not paid'); break; }
  }
  ok(Object.keys(kinds).length === 5, '4 every kind of prize lands and is paid (' + Object.keys(kinds).join(', ') + ')');
  const rs = fresh();
  rs.db.a = [at(0), 15]; rs.db.b = [at(0) + 60000, 30];
  ok(DY.rushUntil(rs) === at(0) + 45 * 60000, '4 a second Coin Rush adds to the end of the first');
  ok(DY.rushMult(rs, at(0) + 44 * 60000) === 2 && DY.rushMult(rs, at(0) + 46 * 60000) === 1, '4 and play pays double only inside it');
}

/* 5 */
{
  const lo = DY.wheel(0), hi = DY.wheel(19);
  ok(lo.length === 13 && lo.every((p) => p.w > 0), '5 thirteen wedges, every one possible');
  let better = true;
  for (let i = 0; i < 19; i++) { const a = DY.wheel(i), b = DY.wheel(i + 1); a.forEach((p, j) => { if (p.kind === 'coins' && b[j].amt < p.amt) better = false; }); }
  ok(better, '5 no coin wedge gets worse at a higher rank');
  ok(lo.find((p) => p.kind === 'pack').pack === 'street' && hi.find((p) => p.kind === 'pack').pack === 'hof', '5 the pack wedge climbs from Streetball to Hall of Fame');
  ok(lo.find((p) => p.kind === 'shard').r === 'common' && hi.find((p) => p.kind === 'shard').r === 'epic', '5 the shard wedge climbs from common to epic');
  const n = {}, N = 40000, r = rng(77), tot = lo.reduce((a, p) => a + p.w, 0);
  for (let i = 0; i < N; i++) { const st = fresh(), w = X.fresh(); const x = DY.spin(st, w, 0, { t: at(0), rng: r }); n[x.index] = (n[x.index] || 0) + 1; }
  const worst = Math.max(...lo.map((p, i) => Math.abs((n[i] || 0) / N - p.w / tot)));
  ok(worst < 0.01, '5 the weights are the odds (worst wedge off by ' + (worst * 100).toFixed(2) + ' points)');
}

/* 6 */
{
  const d = DY.today(at(0));
  const a = DY.todays(d), b = DY.todays(d);
  ok(a.length === 3 && new Set(a.map((q) => q.id)).size === 3 && a.map((q) => q.id).join() === b.map((q) => q.id).join(), '6 three different quests a day, the same on every device');
  const seen = new Set(); for (let i = 0; i < 30; i++) seen.add(DY.todays(DY.today(at(i))).map((q) => q.id).join());
  ok(seen.size > 5, '6 and they change from day to day (' + seen.size + ' sets in 30 days)');
  const wk = DY.weeks(DY.weekOf(d));
  ok(wk.length === 4 && wk.every((q, i) => DY.WEEKLY[i].some((x) => x.id === q.id)), '6 four a week, one from each group');
  ok(DY.weekOf('2026-10-07') === '2026-10-05' && DY.weekOf('2026-10-11') === '2026-10-05' && DY.weekOf('2026-10-12') === '2026-10-12', '6 a week starts on Monday');
  const st = fresh(), w = X.fresh(), q = DY.todays(d);
  const ev = (x) => x.ev;
  DY.note(st, ev(q[0]), 'k1', at(0)); DY.note(st, ev(q[0]), 'k1', at(0));
  ok(DY.count(st, ev(q[0]), d, d) === (ev(q[0]) === 'look' ? 1 : 1), '6 the same event noted twice counts once');
  DY.settleQuests(st, w, at(0));
  const one = X.balance(w);
  ok(one === X.RATE.quest, '6 a finished quest pays ' + X.RATE.quest + ' (' + one + ')');
  DY.settleQuests(st, w, at(0));
  ok(X.balance(w) === one, '6 and pays once');
  q.slice(1).forEach((x, i) => DY.note(st, ev(x), 'k' + (i + 2), at(0)));
  DY.settleQuests(st, w, at(0));
  ok(X.balance(w) === X.RATE.quest * 3 + X.RATE.questAll && DY.spins(st, at(0)).banked === 1 && PK.shards(st).common === 1, '6 all three pay the bonus: coins, a common shard and a spin');
  /* a pack opened counts toward a weekly quest off the pack log */
  const s2 = fresh(), w2 = X.fresh(); X.award(w2, 'g', 1e6, 'x');
  for (let i = 0; i < 3; i++) PK.open(s2, w2, 'street', { t: at(0), id: 'p' + i, rng: rng(i + 9) });
  ok(DY.count(s2, 'pack', DY.weekOf(d), d) === 3, '6 three packs opened this week count as three');
}

/* 7 */
{
  const a = fresh(), b = fresh(), wa = X.fresh();
  DY.spin(a, wa, 0, { t: at(0), rng: rng(1) });
  b.dp[DY.today(at(0))] = [at(0)];
  b.dg.q = [at(0), 1];
  const m = WD.merge(a, b);
  ok(!DY.spins(m, at(0)).free && DY.spins(m, at(0)).banked === 1, '7 a free spin used on one device is used on both, a banked one from the other kept');
  ok(DY.streak(m, at(0)).cur === 1, '7 the day played on the other device is in the streak');
  ok(JSON.stringify(WD.merge(a, b)) === JSON.stringify(WD.merge(b, a)), '7 the merge is the same either way round');
  ok(WD.progress(m) >= WD.progress(a) && WD.progress(m) >= WD.progress(b), '7 a merge is never behind either copy');
  const w = X.fresh(), s = fresh();
  DY.notePlayed(s, w, at(0));
  const s2 = WD.merge(s, s), w2 = X.merge(w, w);
  DY.notePlayed(s2, w2, at(0));
  ok(X.balance(w2) === 150, '7 a streak day paid on one device is not paid again after a merge');
}

/* 8 */
{
  const cat = Array.from({ length: 100 }, (_, i) => ({ tier: ['bronze', 'silver', 'gold', 'ring'][i % 4], got: false }));
  ok(DY.rep(cat).name === 'Walk-On' && DY.rep(cat).pts === 0, '8 no badges is a Walk-On');
  let mono = true, last = -1;
  for (let k = 0; k <= 100; k += 5) { const c = cat.map((b, i) => ({ tier: b.tier, got: i < k })); const r = DY.rep(c); if (r.idx < last) mono = false; last = r.idx; }
  ok(mono, '8 more badges never lowers the rank');
  ok(DY.rep(cat.map((b) => ({ tier: b.tier, got: true }))).name === 'G.O.A.T.', '8 every badge is the G.O.A.T.');
  const real = require('./badges.js');
  const r = DY.rep(real.evaluate({}));
  ok(r.total > 300 && r.name === 'Walk-On', '8 the real cabinet weighs ' + r.total + ' points');
}

/* 9 */
{
  const E = require('./earn.js'), w = X.fresh(), notes = [];
  const wallet = { award: (k, a, s, o) => X.award(w, k, a, s, o), has: (k) => !!w.e[k], baseline: () => false };
  E._use({ econ: X, wallet, signedIn: () => true, notify: () => {}, ward: { daily: { rushMult: () => 2, played: (e, k) => notes.push(e + ':' + k), note: (e, k) => notes.push(e + ':' + k) } } });
  const r = E.fix(500, 0.5, false);
  ok(r.amount === X.fixCoins(0.5) * 2, '9 a Coin Rush doubles a puzzle\'s pay (' + r.amount + ')');
  const again = E.fix(500, 0.5, false);
  ok(!again.paid, '9 and a second ask still pays nothing');
  ok(notes.includes('fx:500'), '9 a finished Fix History files the streak\'s day');
  E._use({ ward: { daily: { rushMult: () => 2, login: () => ({}), played(){}, note(){} } } });
  const bw = E.pay('bg:test', 120, 'badge');
  ok(bw.amount === 120, '9 a badge is not doubled: the rush is for play');
}

/* 10. the page */
async function browser(){
  const pw = require('/opt/node22/lib/node_modules/playwright');
  const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' };
  const out = [];
  async function serve(route){
    const u = new URL(route.request().url());
    if (/stripe|checkout/.test(u.pathname)) { out.push(u.pathname); return route.fulfill({ status: 500, body: '{"error":"blocked"}' }); }
    if (u.hostname !== 'local.test') return route.abort();
    if (u.pathname.startsWith('/sb/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return route.abort();
    await route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  }
  const b = await pw.chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(), boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('rtf.guide.v1', '1'); localStorage.setItem('rtf.scenes.v1', 'off'); } catch (e) {} window.RTF_BOARD_URL = 'http://local.test/sb'; });
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-career:not([disabled])', { state: 'attached', timeout: 30000 });
  await page.waitForSelector('#hp-daily:not([hidden]) .dy-guest', { timeout: 10000 });
  ok(true, '10 a guest sees what an account adds on the front page');
  await page.evaluate(() => { const st = RTF_AUTH.state; RTF_AUTH.state = () => Object.assign({}, st(), { signedIn: true }); RTF_EARN.settle({}); RTF_DAILY_UI.render(); });
  await page.waitForSelector('#hp-daily .dy-t-wheel.ready');
  const strip = await page.evaluate(() => ({ tiles: document.querySelectorAll('#hp-daily .dy-tile').length, flame: !!document.querySelector('#hp-daily img.dy-fl[src^="data:image/png"]'), free: document.querySelector('.dy-t-wheel .dy-tl').textContent, locker: !!document.querySelector('#hp-daily [data-locker="shop"]'), logged: RTF_WARD.daily.logged() }));
  ok(strip.tiles === 4 && strip.locker && strip.flame && /Free spin/.test(strip.free), '10 signed in, the strip shows the flame, a free spin, the quests and the locker');
  ok(strip.logged, '10 opening the game files the login day');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-home.png') });
  await page.click('#hp-daily [data-dy="wheel"]');
  await page.waitForSelector('.dy-ov .dy-wface canvas');
  await page.waitForTimeout(400);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-wheel.png') });
  await page.click('.dy-ov .dy-spin');
  await page.waitForTimeout(1800);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-spinning.png') });
  await page.waitForSelector('.dy-ov .dy-won', { timeout: 9000 });
  const sp = await page.evaluate(() => {
    const h = document.querySelector('.dy-wface'), idx = +h.getAttribute('data-index'), rot = +h.getAttribute('data-rot');
    const st = JSON.parse(localStorage.getItem('rtf.ward.v1')), row = Object.entries(st.dw)[0];
    const n = 13, seg = 360 / n, under = ((-rot % 360) + 360) % 360, wedge = Math.round(under / seg) % n;
    const pz = RTF_DAILY.wheel(row[1][2]);
    const m = getComputedStyle(h).transform, cur = m && m !== 'none' ? (Math.atan2(+m.split(',')[1], +m.split('(')[1].split(',')[0]) * 180 / Math.PI) : 0;
    const shown = Math.round((((-cur % 360) + 360) % 360) / seg) % n;
    return { idx, wedge, shown, logged: row[1][1], prize: pz[idx].id, card: document.querySelector('.dy-won').getAttribute('data-prize') };
  });
  ok(sp.wedge === sp.idx && sp.shown === sp.idx, '10 the wheel stops with the won wedge under the pointer (' + sp.idx + ', ' + sp.wedge + ', ' + sp.shown + ')');
  ok(sp.logged === sp.prize && sp.card === sp.prize, '10 and that wedge is the prize filed and the prize on the card (' + JSON.stringify(sp) + ')');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-won.png') });
  await page.waitForTimeout(1800);
  ok(await page.evaluate(() => /Next free spin|left/.test(document.querySelector('.dy-spin').textContent)), '10 after the free spin the button says so');
  /* finishing a daily files the streak's day and pops what it paid */
  await page.evaluate(() => { RTF_EARN.fix(RTF_PAGE.dayNumberOf ? 900001 : 900001, 0.4, false); });
  await page.waitForSelector('.dy-pop', { timeout: 4000 });
  ok(await page.evaluate(() => RTF_WARD.daily.streak().cur === 1 && /streak/.test(document.querySelector('.dy-pop').textContent)), '10 a Fix History finished starts the streak and says so');
  await page.click('.dy-ov [data-tab="streak"]');
  await page.waitForSelector('.dy-ov .dy-track .dy-slot.got');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-streak.png'), fullPage: false });
  ok(await page.evaluate(() => document.querySelectorAll('.dy-ov .dy-track').length === 2 && !!document.querySelector('.dy-ov img.dy-bigfl')), '10 the streak tab draws the flame and both tracks');
  await page.click('.dy-ov [data-tab="quests"]');
  await page.waitForSelector('.dy-ov .dy-q');
  ok(await page.evaluate(() => document.querySelectorAll('.dy-ov .dy-q').length === 7), '10 the quests tab lists three today and four this week');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-quests.png'), fullPage: false });
  const wide = await page.evaluate(() => [...document.querySelectorAll('.dy-ov *, #hp-daily *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !el.closest('.dy-bulbs,.dy-wrays,.dy-wglow'); }).map((e) => e.className).slice(0, 3));
  ok(!wide.length, '10 nothing runs off a 390px phone (' + wide.join(', ') + ')');
  await page.click('.dy-ov .dy-x');
  ok(await page.evaluate(() => !document.querySelector('.dy-ov')), '10 the hub closes');
  ok(!out.length, '10 no request reached a payment endpoint');
  ok(!boom.length, '10 nothing threw (' + boom.join(' | ') + ')');
  await b.close();
}
if (!QUICK) await browser();

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
