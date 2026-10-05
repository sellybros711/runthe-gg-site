/* The Tour Pass's seasonal dress: Halloween from Oct 4 to Oct 31, then the harvest to the end of Season 2.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-pass-theme.mjs
 *
 *   WINDOW   the theme turns on and off on the right Eastern days, and Season 3 wears none. The theme rides
 *            Season 2, so Oct 4 (Season 1's last day) wears none and Halloween starts with the season on Oct 5.
 *   EVERYWHERE  the hub, the tier-up, the claim summary, the purchase screen, the store card and the home
 *            card all carry the theme's class and its drawn pieces
 *   NOTHING ELSE  the theme is colour and drawings: no tier, price or reward moves
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 240) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const b = await chromium.launch();
const errs = [];
try {
  // Noon UTC is 8am Eastern, so each instant below is well inside the Eastern day it names.
  const days = [
    ['2026-10-03T16:00:00Z', null, 1], ['2026-10-04T16:00:00Z', null, 1], ['2026-10-05T16:00:00Z', 'halloween', 2],
    ['2026-10-31T16:00:00Z', 'halloween', 2], ['2026-11-01T16:00:00Z', 'harvest', 2], ['2026-11-26T16:00:00Z', 'harvest', 2],
    ['2026-12-03T16:00:00Z', 'harvest', 2], ['2026-12-04T16:00:00Z', null, 3],
  ];
  head('the window');
  let seen = null;
  for (const [at, want, ssn] of days) {
    const page = await b.newPage({ viewport: { width: 430, height: 900 } });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.clock.setSystemTime(new Date(at));
    await page.goto(HOST + '/golf/index.html');
    await page.waitForFunction(() => typeof passThemeNow === 'function' && typeof passSeason === 'function');
    const r = await page.evaluate(() => ({ th: passThemeNow(), n: passSeason().n, acc: passAcc(), acc2: passAcc2(), cls: passThemeCls(),
      tiers: PASS_TIERS, price: TOURPASS.usd, t5: JSON.stringify(passTierReward(5, 'prem')) }));
    ok(`${at.slice(0, 10)}: ${want || 'no theme'} (Season ${ssn})`, r.th === want && r.n === ssn && (want ? r.cls === ' tpth-' + want : r.cls === ''), r);
    if (r.n === 2) { if (seen) ok(`${at.slice(0, 10)}: the theme moves no number`, r.tiers === seen.tiers && r.price === seen.price && r.t5 === seen.t5); else seen = r; }
    if (want === 'harvest') ok('the harvest wears its own accent', r.acc === '#cf5a26' && r.acc2 === '#f4b84e', r);
    await page.close();
  }

  head('every pass surface wears it');
  for (const th of ['halloween', 'harvest']) {
    const page = await b.newPage({ viewport: { width: 430, height: 900 } });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.clock.setSystemTime(new Date(th === 'halloween' ? '2026-10-12T16:00:00Z' : '2026-11-12T16:00:00Z'));
    await page.goto(HOST + '/golf/index.html');
    await page.waitForFunction(() => typeof overlayPassLevel === 'function');
    const R = await page.evaluate((th) => {
      sbUser = { id: 'x', email: 'x@example.com' };
      const never = function () { return { then: function () { return this; }, catch: function () { return this; } }; };
      sb = { from: function () { return { select: function () { return { eq: function () { return { limit: never, order: function () { return { limit: never }; } }; }, order: function () { return { limit: never }; }, limit: never }; } }; }, rpc: never, functions: { invoke: never } };
      _walletCache = { paid: 0, lifePurchased: 0, lifeGranted: 0, tokens: 0, passActive: false, passPeriod: 'S' + passSeason().n };
      const cls = 'tpth-' + th, out = {};
      const probe = (name, fn) => { const d = document.createElement('div'); document.body.appendChild(d);
        try { fn(d); const root = d.firstElementChild; out[name] = { cls: !!(root && root.classList.contains(cls)) || !!d.querySelector('.' + cls), deco: !!d.querySelector('.tpdeco,.tpdc') }; }
        catch (e) { out[name] = { err: String(e) }; } d.remove(); };
      probe('hub', (d) => { S.overlay = 'tourpass'; overlayTourPass(d); });
      probe('levelup', (d) => { S.passLevel = { xp0: 0, tier0: 0, xp1: passXpForTierX(2), tier1: 2 }; overlayPassLevel(d); S.passLevel = null; });
      probe('claim', (d) => { S.passClaimSummary = { n: 1, coins: 100, packs: {}, shards: {}, cos: [] }; overlayPassClaim(d); });
      probe('purchased', (d) => { S.purchased = { kind: 'pass' }; overlayPurchased(d); });
      probe('launch', (d) => { overlaySeasonLaunch(d); });
      probe('store', (d) => { d.appendChild(bucketShopNode('pass')); });
      probe('home', (d) => { d.appendChild(tourPassCard()); });
      S.overlay = null; return out;
    }, th);
    for (const k of Object.keys(R)) ok(`${th}: the ${k} wears the theme and its pieces`, R[k].cls && R[k].deco, R[k]);
    await page.close();
  }
  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
} finally { await b.close(); }
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
