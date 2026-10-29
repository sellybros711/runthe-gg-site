/* Winter Classic: the December event page, its advent calendar and its Hanukkah gifts.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-winter.mjs
 *
 *   WINDOW     the event runs Dec 1 to Dec 31 (Eastern), a door opens on its own day, and Hanukkah's eight
 *              nights run Dec 4 to Dec 11 with every candle lightable until Dec 12
 *   LADDER     door prizes climb every day and Christmas is the biggest; night 8 is the biggest gift
 *   TRIVIA     a right answer doubles the prize, a wrong one still pays it, and a door pays once
 *   PRO        Tour Pass Pro adds a second prize to every door and doubles the gelt
 *   FAIR       a guest pays nothing; the dreidel lands the same way every time for one account and night
 *   COPY       every question has four different answers and names no real course
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST || 'http://localhost:8099';
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 240) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const RIG = (pro, uid) => {
  sbUser = uid ? { id: uid, email: 'x@example.com' } : null;
  const never = function () { return { then: function () { return this; }, catch: function () { return this; } }; };
  sb = { from: function () { return { select: function () { return { eq: function () { return { limit: never, order: function () { return { limit: never }; } }; }, order: function () { return { limit: never }; }, limit: never }; } }; }, rpc: never, functions: { invoke: never } };
  try { cloudPush = function () {}; } catch (e) {}
  try { localStorage.clear(); localStorage.setItem('bag_tour_done', 'true'); } catch (e) {}
  _walletCache = { paid: 0, lifePurchased: 0, lifeGranted: 0, tokens: 0, passActive: !!pro, passPeriod: 'S' + passSeason().n };
  S.overlay = null; return true;
};

const b = await chromium.launch();
const errs = [];
const at = async (iso) => {
  const page = await b.newPage({ viewport: { width: 430, height: 900 } });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.clock.setSystemTime(new Date(iso));
  await page.goto(HOST + '/golf/index.html');
  await page.waitForFunction(() => typeof wcLive === 'function' && typeof passSeason === 'function');
  return page;
};
try {
  head('the window');
  for (const [iso, live, hk] of [['2026-11-30T17:00:00Z', false, false], ['2026-12-01T17:00:00Z', true, false], ['2026-12-04T17:00:00Z', true, true],
    ['2026-12-12T17:00:00Z', true, true], ['2026-12-13T17:00:00Z', true, false], ['2026-12-31T17:00:00Z', true, false], ['2027-01-01T17:00:00Z', false, false]]) {
    const page = await at(iso);
    const r = await page.evaluate((RIG) => { eval('(' + RIG + ')')(false, 'w1');
      return { live: wcLive(), hk: wcHnkLive(), ids: homeModeList().map((m) => m.id) }; }, RIG.toString());
    ok(`${iso.slice(0, 10)}: event ${live ? 'on' : 'off'}, Hanukkah ${hk ? 'on' : 'off'}`, r.live === live && r.hk === hk && r.ids.includes('winter') === live, r);
    await page.close();
  }

  head('Dec 7: the doors, the ladder, the trivia');
  let page = await at('2026-12-07T17:00:00Z');
  const E = (f) => page.evaluate(f);
  await page.evaluate((RIG) => eval('(' + RIG + ')')(false, 'w1'), RIG.toString());
  let r = await E(() => ({ open: [1, 6, 7, 8, 25].map(wcDoorOpen), todo: wcTodo() }));
  ok('doors 1 to 7 open, 8 and 25 do not', r.open.join() === 'true,true,true,false,false', r);
  ok('7 doors and 4 candles are waiting', r.todo === 11, r);
  r = await E(() => { const c = [...Array(25)].map((_, i) => wcDoorPrize(i + 1, false).coins); return { c, x: wcDoorPrize(25, false), xp: wcDoorPrize(25, true), p6: wcDoorPrize(6, true) }; });
  ok('free door prizes climb every day', r.c.slice(0, 24).every((v, i, a) => i === 0 || v > a[i - 1]), r.c);
  ok('Christmas is the biggest by far, with a pack', r.x.coins >= 5 * r.c[23] && r.x.packs.length === 1, r.x);
  ok('Pro adds a second prize, and a pack on every 6th door and Christmas', r.xp.coins > r.x.coins && r.xp.packs.length === 2 && r.p6.packs.length === 1 && r.p6.coins === 2 * r.c[5], { xp: r.xp, p6: r.p6 });
  r = await E(() => { const b0 = coinBalance(); const paid = wcAnswer(7, true); const d1 = coinBalance() - b0; const again = wcAnswer(7, true);
    const b1 = coinBalance(); const w = wcAnswer(3, false); return { paid, d1, again, d2: coinBalance() - b1, w, base7: wcDoorPrize(7, false).coins, base3: wcDoorPrize(3, false).coins, got7: wcGot('d', 7), got3: wcGot('d', 3), late8: wcAnswer(8, true) }; });
  ok('a right answer pays double', r.d1 === 2 * r.base7 && r.got7 === 2, r);
  ok('a door pays once', r.again === null, r);
  ok('a wrong answer still pays the prize', r.d2 === r.base3 && r.got3 === 1, r);
  ok('a door that has not come round yet cannot be opened', r.late8 === null, r);
  r = await E(() => WC_TRIVIA.map((t) => ({ n: new Set(t.a).size, q: t.q })));
  ok('25 questions, each with four different answers', r.length === 25 && r.every((x) => x.n === 4), r.filter((x) => x.n !== 4));
  r = await E(() => JSON.stringify(WC_TRIVIA));
  ok('no question names a real course', !/augusta|st\.? andrews|pebble|pinehurst|carnoustie|muirfield|oakmont|sawgrass|bethpage|shinnecock/i.test(r));
  r = await E(() => { const a = wcQuestion(12), b2 = wcQuestion(12); return { same: JSON.stringify(a) === JSON.stringify(b2), one: a.opts.filter((o) => o.right).length }; });
  ok('a door asks the same question in the same order every time, with one right answer', r.same && r.one === 1, r);

  head('Hanukkah');
  r = await E(() => { const g = [...Array(8)].map((_, i) => wcGelt(i + 1, false).coins); const b0 = coinBalance(); const L = wcLight(4); const d = coinBalance() - b0;
    return { g, L, d, again: wcLight(4), n5: wcLight(5), spinSame: wcSpin(2).name === wcSpin(2).name, p8: wcGelt(8, false), pp: wcGelt(3, true).coins === 2 * wcGelt(3, false).coins }; });
  ok('gelt grows each night and night 8 is the biggest, with a pack', r.g.every((v, i, a) => i === 0 || v > a[i - 1]) && r.p8.packs.length === 1, r.g);
  ok('lighting a night pays the gelt times the dreidel', !!r.L && r.d === r.L.paid.coins && r.L.paid.coins === Math.round(r.g[3] * r.L.spin.x), { L: r.L, d: r.d });
  ok('a night pays once, and a night still to come cannot be lit', r.again === null && r.n5 === null, r);
  ok('the dreidel lands the same way for one account and night', r.spinSame);
  ok('Pro doubles the gelt', r.pp);

  head('a guest');
  await page.evaluate((RIG) => eval('(' + RIG + ')')(false, null), RIG.toString());
  r = await E(() => ({ a: wcAnswer(5, true), l: wcLight(2), todo: wcTodo() }));
  ok('pays nothing and is counted as having nothing to open', r.a === null && r.l === null && r.todo === 0, r);

  head('the page and the home card');
  await page.evaluate((RIG) => eval('(' + RIG + ')')(true, 'w2'), RIG.toString());
  r = await E(() => { const d = document.createElement('div'); document.body.appendChild(d); S.overlay = 'winter'; overlayWinter(d);
    const o = { doors: d.querySelectorAll('.wc-door').length, openable: d.querySelectorAll('[data-wcdoor]').length, today: d.querySelectorAll('.wc-door.today').length,
      nights: d.querySelectorAll('.wc-nt').length, todoNights: d.querySelectorAll('[data-wcnight]').length, txt: d.textContent.replace(/\s+/g, ' ') };
    d.remove(); S.overlay = null; o.card = winterCard().textContent.replace(/\s+/g, ' '); return o; });
  ok('25 doors, 7 to open, one marked today', r.doors === 25 && r.openable === 7 && r.today === 1, r);
  ok('8 nights, 4 to light', r.nights === 8 && r.todoNights === 4, r);
  ok('Pro sees its prizes are on', /PRO PRIZES ON/.test(r.txt), r.txt.slice(0, 200));
  ok('the home card counts what is waiting', /11 to open/.test(r.card), r.card);
  await page.close();

  head('desktop: the event card sits under the hero, and the drop banner goes');
  page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.clock.setSystemTime(new Date('2026-12-07T17:00:00Z'));
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(HOST + '/golf/index.html'); await page.waitForTimeout(2200);
  r = await page.evaluate(() => { S.overlay = null; S.screen = 'title'; render(); const vis = (e) => !!e && getComputedStyle(e).display !== 'none';
    return { left: vis(document.querySelector('.homeextras .gc-winter')), rail: vis(document.querySelector('.homerail .gc-winter')), drop: vis(document.querySelector('.homedrop')) }; });
  ok('left column card shown, rail card and banner hidden', r.left && !r.rail && !r.drop, r);
  await page.close();

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
} finally { await b.close(); }
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
