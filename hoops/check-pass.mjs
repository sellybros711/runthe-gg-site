/* Run The Floor: the Floor Pass (hoops/pass.js and hoops/pass-ui.js).
 *
 *   node hoops/check-pass.mjs            the rules, then the page
 *   node hoops/check-pass.mjs --quick    the rules only, no browser
 *   SHOT=/tmp/p.png node hoops/check-pass.mjs   and screenshots
 *
 *  1. The season: sixty Eastern days from the epoch, and the clock runs to
 *     the Eastern midnight after the last day.
 *  2. The curve: Run The Tour's, tier 1 800 XP, tier 60 2,000, 84,000 in all.
 *  3. The cap: 2,000,000 coins of farming on one day moves the track 2,100,
 *     and two devices that each earned a full day offline still count one.
 *  4. XP is keyed: the same award counted twice moves the track once.
 *  5. The pace: a capped player needs forty days, a light one does not finish.
 *  6. The lanes: packs at the plan's tiers, the season's pieces exclusive and
 *     drawable, every tier pays something.
 *  7. Claiming: locked until reached, paid once, the premium lane shut unless
 *     it was open, Claim all.
 *  8. Settlement: what was reached and not claimed is paid when the season
 *     ends, once, and the premium lane only if it was open that season.
 *  9. Two devices: the logs merge by union, nothing pays twice.
 * 10. Quests pay their own XP, once.
 * 11. Earning: play and badges feed the pass off their base coins (a Coin Rush
 *     doubles coins, never XP), and the daily loop's rewards do not.
 * 12. The page: the banner, XP and tier pops, the track, a claim and its
 *     reveal, the premium lane locked and then comped, nothing off a phone.
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
const P = require('./pass.js');
const CAT = require('./catalog.js');
const WD = require('./wardrobe.js');
const IDL = require('./idles.js');

let passes = 0, fails = 0;
function ok(c, m){ if (c) { passes++; console.log('  ok ' + m); } else { fails++; console.log('  FAIL ' + m); } }
/* noon Eastern on the epoch, plus whole days */
const E0 = Date.UTC(2026, 9, 12, 16, 0, 0);
const at = (n, h) => E0 + n * 864e5 + (h || 0) * 36e5;
const fresh = () => { const st = WD.fresh(); DY.ensure(st); P.ensure(st); PK.cleanLogs(st, st); return st; };
const nyHour = (ms) => +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(ms));

/* 1 */
{
  ok(P.season(at(0)).n === 1 && P.season(at(0)).day === 1, '1 the epoch is season 1, day 1');
  ok(P.season(at(59)).n === 1 && P.season(at(59)).daysLeft === 1, '1 day 60 is still season 1, its last day');
  ok(P.season(at(60)).n === 2 && P.season(at(60)).day === 1, '1 day 61 is season 2, day 1');
  ok(P.season(at(0)).end === '2026-12-10', '1 season 1 ends December 10 (' + P.season(at(0)).end + ')');
  const end = P.endsAt(1);
  ok(nyHour(end) === 0 && X.dayOf(end) === '2026-12-11' && X.dayOf(end - 1000) === '2026-12-10', '1 the clock runs to the Eastern midnight after the last day, across the clock change');
  ok(P.countdown(1, end + 5e6).ms === 0, '1 a finished season reads zero, never below');
}

/* 2 */
{
  ok(P.cost(1) === 800 && Math.round(P.cost(60)) === 2000, '2 tier 1 costs 800 and tier 60 costs 2,000');
  ok(Math.abs(P.xpFor(60) - 84000) < 50, '2 about 84,000 XP in all (' + P.xpFor(60) + ')');
  let mono = true; for (let x = 0; x < 90000; x += 997) { const t = P.tierAt(x); if (P.xpFor(t) > x || (t < 60 && P.xpFor(t + 1) <= x)) mono = false; }
  ok(mono, '2 tierAt is the inverse of the curve everywhere');
}

/* 3 */
{
  const st = fresh();
  for (let i = 0; i < 200; i++) P.addXp(st, 'farm:' + i, P.coinXp(10000), at(3, i / 100));
  ok(P.xp(st, 1) === P.DAY_CAP, '3 2,000,000 coins of farming on one day moves the track ' + P.DAY_CAP + ' (' + P.xp(st, 1) + ')');
  P.addXp(st, 'next', 5000, at(4));
  ok(P.xp(st, 1) === P.DAY_CAP * 2, '3 the next day has its own cap');
  const a = fresh(), b = fresh();
  P.addXp(a, 'x:run:1', 2100, at(5)); P.addXp(b, 'x:run:2', 2100, at(5, 2));
  const m = WD.merge(a, b);
  ok(P.xp(m, 1) === P.DAY_CAP, '3 two devices that each earned a full day offline merge to one day\'s cap (' + P.xp(m, 1) + ')');
  ok(P.addXp(st, 'late', 400, at(3, 5)) === 0, '3 XP past the cap moves nothing and says so');
}

/* 4 */
{
  const st = fresh();
  ok(P.addXp(st, 'x:run:9', 300, at(1)) === 300, '4 an award moves the track');
  ok(P.addXp(st, 'x:run:9', 300, at(1, 1)) === 0 && P.xp(st, 1) === 300, '4 the same award again moves nothing');
  const k2 = fresh(); P.addXp(k2, 'x:run:6', 2100, at(1)); P.addXp(k2, 'x:run:7', 2100, at(1, 1)); P.addXp(k2, 'x:run:7', 2100, at(2));
  ok(P.xp(k2, 1) === 2100, '4 an award counted again on a later day is not moved to that day (' + P.xp(k2, 1) + ')');
  ok(P.coinXp(15200) === 1976, '4 a typical day of coins is 1,976 XP');
}

/* 5 */
{
  const day = (perDay, n) => { const st = fresh(); let fin = null; for (let d = 0; d < n; d++) { P.addXp(st, 'd' + d, perDay, at(d)); if (fin == null && P.tierAt(P.xp(st, 1)) >= 60) fin = d + 1; } return { fin, tier: P.tierAt(P.xp(st, 1)) }; };
  const heavy = day(50000, 60), typical = day(P.coinXp(15200) + 280, 60), light = day(P.coinXp(8000) + 280, 60);
  ok(heavy.fin === 40, '5 a capped player needs forty days (' + heavy.fin + ')');
  ok(typical.fin >= 40 && typical.fin <= 45, '5 a typical player finishes between day 40 and 45 (' + typical.fin + ')');
  ok(light.fin === null && light.tier >= 48, '5 a light player does not finish and still reaches tier 48 or more (' + light.tier + ')');
}

/* 6 */
{
  const free = [5, 10, 20, 30, 40, 50].every((t) => P.reward(t, 'free', 1).pack);
  ok(free && P.reward(60, 'free', 1).pack === 'league', '6 the free lane has packs at 5, 10, 20, 30, 40 and 50 and a League Pack at 60');
  ok(P.reward(15, 'free', 1).items && P.reward(35, 'free', 1).items && P.reward(60, 'free', 1).items.length === 2, '6 and the season\'s pieces at 15 and 35, and an exclusive fit at 60');
  const pieces = P.pieces(1);
  const bad = pieces.filter((p) => { const it = CAT.item(p.id); return !it || !it.excl || CAT.sold(it) || it.earn !== 'pass:1'; }).map((p) => p.id);
  ok(pieces.length >= 12 && !bad.length, '6 every one of the season\'s ' + pieces.length + ' pieces is an exclusive in the catalogue, never sold (' + bad.join(', ') + ')');
  const pool = PK.pool('2026-11-01').map((it) => it.id);
  ok(!pieces.some((p) => pool.indexOf(p.id) >= 0), '6 and never in a pack');
  ok(pieces.filter((p) => CAT.item(p.id).slot === 'idle').every((p) => IDL.isIdle(p.id)), '6 the season\'s idle moves');
  ok(P.reward(60, 'prem', 1).items.indexOf('id_tipoff') >= 0, '6 the premium lane\'s tier 60 is the exclusive idle');
  let empty = []; for (let t = 1; t <= 60; t++) ['free', 'prem'].forEach((l) => { const r = P.reward(t, l, 1); if (!r.coins && !r.pack && !r.shard && !r.spin && !r.items) empty.push(l + t); });
  ok(!empty.length, '6 every tier pays something (' + empty.join(', ') + ')');
  const packs = (l) => { let n = 0; for (let t = 1; t <= 60; t++) { const r = P.reward(t, l, 1); if (r.pack) n += X.PACKS[r.pack].price; } return n; };
  ok(packs('prem') >= packs('free') * 2, '6 the premium lane carries at least twice the free lane\'s packs, at shop prices (' + packs('prem') + ' against ' + packs('free') + ')');
}

/* 7 */
{
  const st = fresh(), w = X.fresh();
  ok(P.claim(st, w, 1, 'free', { t: at(1) }).err === 'locked', '7 a tier not reached cannot be claimed');
  P.addXp(st, 'a', 2100, at(0)); P.addXp(st, 'b', 2100, at(1)); P.addXp(st, 'c', 2100, at(2));
  const tier = P.tierAt(P.xp(st, 1));
  ok(tier === 7, '7 6,300 XP is tier 7 (' + tier + ')');
  const c5 = P.claim(st, w, 5, 'free', { t: at(2) });
  ok(c5.got && c5.got.pack === 'street' && PK.credits(st, 'street').length === 1, '7 claiming tier 5 gives the Streetball Pack');
  ok(P.claim(st, w, 5, 'free', { t: at(2) }).err === 'already' && PK.credits(st, 'street').length === 1, '7 claiming it again pays nothing');
  const c1 = P.claim(st, w, 1, 'free', { t: at(2) });
  ok(c1.got.coins === P.reward(1, 'free', 1).coins && X.balance(w) === c1.got.coins, '7 tier 1 pays its coins into the wallet');
  ok(P.claim(st, w, 5, 'prem', { t: at(2) }).err === 'paid', '7 the premium lane is shut unless it was open');
  P.notePaid(st, 1, at(2));
  ok(P.claim(st, w, 5, 'prem', { t: at(2) }).got.pack === 'league', '7 once open, premium tier 5 gives a League Pack');
  const all = P.claimAll(st, w, { t: at(2) });
  ok(all.length === 7 + 7 - 3 && P.claimable(st, 1, at(2)) === 0, '7 Claim all takes every reached tier on both lanes (' + all.length + ')');
  for (let d = 3; d < 13; d++) P.addXp(st, 'z' + d, 2100, at(d));
  P.claimAll(st, w, { t: at(12) });
  ok(st.own.ps1_cap && st.own.ps1_band, '7 the pieces at 10 and 15 land in what he owns');
}

/* 8 */
{
  const st = fresh(), w = X.fresh();
  for (let d = 0; d < 6; d++) P.addXp(st, 's' + d, 2100, at(d));
  P.claim(st, w, 1, 'free', { t: at(6) });
  const reached = P.tierAt(P.xp(st, 1));
  ok(!P.settle(st, w, at(30)).length, '8 nothing is settled while the season runs');
  const paid = P.settle(st, w, at(61));
  ok(paid.length === reached - 1 && paid.every((r) => r.lane === 'free'), '8 after it ends, every reached unclaimed free tier is paid (' + paid.length + ' of ' + (reached - 1) + ')');
  ok(!P.settle(st, w, at(62)).length, '8 and settling again pays nothing');
  const p2 = fresh(), w2 = X.fresh();
  for (let d = 0; d < 6; d++) P.addXp(p2, 's' + d, 2100, at(d));
  P.notePaid(p2, 1, at(1));
  ok(P.settle(p2, w2, at(61)).filter((r) => r.lane === 'prem').length === P.tierAt(P.xp(p2, 1)), '8 the premium lane is settled when it was open that season');
  P.settle(st, w, at(130));
  ok(!Object.keys(st.fx).length && !Object.keys(st.fc).length, '8 two seasons on, the old logs are let go');
}

/* 9 */
{
  const a = fresh(), b = fresh(), wa = X.fresh(), wb = X.fresh();
  [a, b].forEach((s, i) => { P.addXp(s, 'x:run:' + i, 1000, at(0, i)); });
  const m = WD.merge(a, b);
  ok(P.xp(m, 1) === 2000, '9 two devices\' XP is the union');
  P.addXp(a, 'x:more', 2100, at(1)); P.addXp(b, 'x:more2', 2100, at(2));
  P.claim(a, wa, 1, 'free', { t: at(3) }); P.claim(b, wb, 1, 'free', { t: at(3, 1) });
  const m2 = WD.merge(a, b), w2 = X.merge(wa, wb);
  ok(Object.keys(m2.fc).length === 1 && X.balance(w2) === P.reward(1, 'free', 1).coins, '9 the same tier claimed on two devices is one claim and pays once');
  ok(WD.progress(m2) >= WD.progress(a), '9 the merged record is not behind either device');
}

/* 10 */
{
  const st = fresh(), w = X.fresh();
  X.award(w, 'qd:2026-10-12:dd', 320, 'quest', { t: at(0) });
  X.award(w, 'qda:2026-10-12', 480, 'quest', { t: at(0) });
  PK.grantCredit(st, 'qwa:2026-10-12', 'league', at(0));
  ok(P.questXp(st, w, at(0)) === P.QUEST_XP.qd + P.QUEST_XP.qda + P.QUEST_XP.qwa, '10 a quest, the daily set and the weekly set pay their own XP');
  ok(P.questXp(st, w, at(0)) === 0, '10 once');
  X.award(w, 'streak:x', 999, 'streak', { t: at(0) });
  ok(P.questXp(st, w, at(0)) === 0, '10 a streak reward is not a quest');
}

/* 11 */
{
  const E = require('./earn.js');
  const got = [];
  const wallet = (() => { const w = X.fresh(); return { has: (k) => !!w.e[k], award: (k, a, s, o) => X.award(w, k, a, s, o) }; })();
  let mult = 1;
  E._use({ econ: X, wallet, signedIn: () => true, notify: () => {}, ward: { daily: { rushMult: () => mult, login(){}, played(){}, note(){} }, pass: { xp: (k, base) => got.push([k, base]), settle(){} } } });
  E.pay('run:1', 1000, 'run');
  ok(got.length === 1 && got[0][1] === 1000, '11 a run feeds the pass its coins');
  mult = 2; E.pay('run:2', 1000, 'run');
  ok(got.length === 2 && got[1][1] === 1000, '11 a Coin Rush doubles the coins and never the XP (' + got[1][1] + ')');
  mult = 1; E.pay('bg:x', 480, 'badge');
  ok(got.length === 3, '11 a badge feeds the pass');
  E.pay('streak:x', 150, 'streak'); E.pay('wh:x', 150, 'wheel');
  ok(got.length === 3, '11 the daily loop\'s rewards do not');
  E.pay('run:1', 1000, 'run');
  ok(got.length === 3, '11 a run paid already feeds nothing more');
}

/* 12. the page */
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
  await page.waitForSelector('#hp-pass:not([hidden]) .fp-ban.guest', { timeout: 10000 });
  ok(await page.evaluate(() => /Sign in/.test(document.querySelector('#hp-pass').textContent)), '12 a guest sees the season and that signing in climbs it');
  await page.evaluate(() => { const st = RTF_AUTH.state; RTF_AUTH.state = () => Object.assign({}, st(), { signedIn: true }); RTF_WARD.pass._paid(() => false); RTF_EARN.settle({}); RTF_PASS_UI.render(); });
  await page.waitForSelector('#hp-pass .fp-ban:not(.guest)');
  ok(await page.evaluate(() => document.querySelector('#hp-pass .fp-tierb b').textContent === '0'), '12 signed in, the banner shows tier 0');
  await page.evaluate(() => { for (let i = 0; i < 4; i++) RTF_WARD.pass.xp('t:' + i, 6000); });
  await page.waitForSelector('.fp-xpop.on', { timeout: 3000 });
  ok(await page.evaluate(() => /Pass XP/.test(document.querySelector('.fp-xpop').textContent)), '12 XP earned says so');
  await page.waitForSelector('.fp-tpop.on', { timeout: 3000 });
  const tp = await page.evaluate(() => ({ n: document.querySelectorAll('.fp-tpop').length, text: document.querySelector('.fp-tpop').textContent, tier: RTF_WARD.pass.state().tier, today: RTF_WARD.pass.state().today }));
  ok(tp.today === 2100, '12 3,120 XP in one sitting is held to the day\'s 2,100');
  ok(tp.tier === 2 && tp.n === 1 && new RegExp('Tier ' + tp.tier + ' reached').test(tp.text), '12 two tiers crossed pop one card, for the highest (' + JSON.stringify(tp) + ')');
  ok(await page.evaluate(() => document.querySelector('#hp-pass .fp-tierb b').textContent === '2' && !!document.querySelector('#hp-pass .fp-claimb')), '12 the banner moves to tier 2 and counts what is waiting');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-home.png') });
  /* reach tier 5 with real days: XP is capped per day, so it is written on the record */
  await page.evaluate(() => { const st = RTF_WARD.load(); for (let d = 1; d <= 3; d++) st.fx['old' + d] = [Date.now() - d * 864e5, 2100, RTF_PASS.season().n]; RTF_WARD.save(st); RTF_WARD.pass.settle(); });
  await page.click('#hp-pass .fp-ban');
  await page.waitForSelector('.fp-ov .fp-track .fp-col');
  const tr = await page.evaluate(() => ({ cols: document.querySelectorAll('.fp-ov .fp-col').length, ready: document.querySelectorAll('.fp-ov .fp-cell.free.ready').length, lock: document.querySelectorAll('.fp-ov .fp-cell.prem.lock').length, cta: !!document.querySelector('.fp-premcta'), hero: document.querySelectorAll('.fp-ov .fp-pz img').length, tier: RTF_WARD.pass.state().tier }));
  ok(tr.cols === 60 && tr.hero === 2, '12 the track draws sixty tiers and the capstones on the plinth');
  ok(tr.ready === tr.tier && tr.tier >= 5, '12 every reached free tier is ready to claim (' + tr.ready + ' of ' + tr.tier + ')');
  ok(tr.lock === 60 && tr.cta, '12 the premium lane is locked and says it is coming');
  const vis = await page.evaluate(() => { const t = document.querySelector('.fp-track'), n = t.querySelector('.fp-col.next'); if (!n) return true; const a = t.getBoundingClientRect(), r = n.getBoundingClientRect(); return r.left >= a.left - 1 && r.right <= a.right + 1; });
  ok(vis, '12 the track opens scrolled to the next tier');
  ok(await page.evaluate(() => { const r = RTF_PASS_UI._shield; return r.length > 10 && r.every((x) => x.length === r[0].length); }), '12 the pass\'s shield is a whole grid, every row one width');
  ok(await page.evaluate(() => !document.querySelector('.fp-tpop.on')), '12 opening the track puts the tier card away');
  await page.waitForTimeout(400);
  if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT.replace('.png', '-track.png') }); await page.evaluate(() => document.querySelector('.fp-ov').scrollTo(0, 0)); await page.screenshot({ path: process.env.SHOT.replace('.png', '-hero.png') }); }
  await page.evaluate(() => { const c = document.querySelector('.fp-cell.free[data-tier="5"]'); c.scrollIntoView(); c.click(); });
  await page.waitForSelector('.fp-ov .fp-won', { timeout: 3000 });
  const won = await page.evaluate(() => ({ text: document.querySelector('.fp-won').textContent, packs: RTF_WARD.shop.credits('street').filter((c) => /^fp:/.test(c.key)).length, got: !!document.querySelector('.fp-cell.free.got[data-tier="5"]') }));
  ok(/Tier 5/.test(won.text) && won.packs === 1 && won.got, '12 claiming tier 5 reveals the pack, files it and marks the tier Got');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-won.png') });
  /* ON SALE IS NOT OWNED (Phase 6). Dark, there is no buy button. Flipped on
     sale in the page, the sheet offers Premium at its price and the lane stays
     locked; the press goes to the one checkout, stopped here. */
  ok(await page.evaluate(() => !document.querySelector('.fp-ov .fp-buy')), '12b dark: the pass sheet has no buy button');
  await page.evaluate(() => { RTF_PASS.PASS_PAID_ENABLED = true; RTF_AUTH.token = () => 'tok'; RTF_WARD.pass.settle(); });
  await page.waitForSelector('.fp-ov .fp-buy', { timeout: 3000 }).catch(() => {});
  const sale = await page.evaluate(() => ({ buy: (document.querySelector('.fp-ov .fp-buy') || {}).textContent || '', lock: document.querySelectorAll('.fp-ov .fp-cell.prem.lock').length, open: RTF_WARD.pass.paidOpen() }));
  ok(/\$9\.99/.test(sale.buy) && sale.lock === 60 && !sale.open, '12b on sale: a buy button at its price, and the lane still locked (' + sale.buy + ', ' + sale.lock + ' locked)');
  await page.evaluate(() => document.querySelector('.fp-ov .fp-buy').click());
  await page.waitForSelector('.fp-ov .fp-err:not([hidden])', { timeout: 3000 }).catch(() => {});
  ok(out.some((u) => /checkout-bundle/.test(u)) && await page.evaluate(() => !!document.querySelector('.fp-ov .fp-err:not([hidden])')), '12b on sale: the press goes to the one checkout, and a refusal is said');
  out.length = 0;
  await page.evaluate(() => { RTF_PASS.PASS_PAID_ENABLED = false; });
  await page.evaluate(() => { RTF_WARD.pass._paid(() => true); RTF_WARD.pass.settle(); });
  await page.waitForFunction(() => document.querySelectorAll('.fp-ov .fp-cell.prem.ready').length > 0);
  await page.evaluate(() => document.querySelector('.fp-ov .fp-all').click());
  await page.waitForSelector('.fp-ov .fp-won');
  const after = await page.evaluate(() => ({ left: RTF_WARD.pass.state().claimable, prem: document.querySelectorAll('.fp-ov .fp-cell.prem.got').length }));
  ok(after.left === 0 && after.prem >= 5, '12 a tester has the premium lane, and Claim all takes both lanes (' + JSON.stringify(after) + ')');
  /* the reveal pops in on a scale that overshoots for a moment: a box read
     mid bounce is the animation, not the layout, so wait it out */
  await page.waitForTimeout(900);
  const wide = await page.evaluate(() => [...document.querySelectorAll('.fp-ov *, #hp-pass *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !el.closest('.fp-track,.fp-rays,.fp-wrays,.fp-spot,.fp-bshine,.fp-cglow'); }).map((e) => e.className).slice(0, 3));
  ok(!wide.length, '12 nothing runs off a 390px phone (' + wide.join(', ') + ')');
  await page.click('.fp-ov .fp-x');
  ok(await page.evaluate(() => !document.querySelector('.fp-ov')), '12 the track closes');
  ok(!out.length, '12 no request reached a payment endpoint');
  ok(!boom.length, '12 nothing threw (' + boom.join(' | ') + ')');
  await b.close();
}
if (!QUICK) await browser();

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
