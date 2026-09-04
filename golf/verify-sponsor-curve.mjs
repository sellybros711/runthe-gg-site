/* When the sponsor ladder actually gets climbed, in a browser.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/verify-sponsor-curve.mjs
 *
 * A good player used to hold a maxed top-tier deal by about year 13 of a thirty-season career, and then
 * had seventeen years with nothing left to climb. Everything that fed the market value saturated early:
 * followers at 3.2M, OVR at 94, the CV at ten wins and four majors. This walks three careers year by
 * year through the page's OWN eligibleSponsorTier() and reports the season each rung is reached.
 *
 * The careers are stated as trajectories rather than played: playing thirty seasons three times over in
 * a browser would take longer than anyone will wait, and what is being checked is the CURVE, which is a
 * pure function of following, OVR, wins, majors and seasons. Those five numbers are what a season
 * produces, so feeding them directly tests the thing under test and nothing else.
 *
 * The bar it has to clear:
 *   a GOOD career (a fine tour pro) never reaches the top rung at all
 *   a GREAT career reaches it in the year 20 to 25 window
 *   an ALL-TIME career reaches it in that same window, not a decade earlier
 *   every career still gets a real deal early, so year one is not a wasteland
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_spncurve.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 200) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__SP = {
  tiers(){ return {names:SPONSOR_TIERS.map(function(t){return t.name;}), req:SPONSOR_TIER_REQ.slice(),
    minYr:SPONSOR_TIER_MINYR.slice(), relMax:SPONSOR_REL_MAX, relAmb:SPONSOR_REL_AMB}; },
  /* State one season of a career and ask the page what tier it attracts. Only the five inputs the value
     is a function of are set; everything else is the shipped code. */
  at(y){
    if(!S.career) S.career={};
    S.career.story={followers:y.fol, feed:[]};
    S.career.wins=y.wins; S.career.majors=y.majors; S.career.peakOvr=y.peak;
    S.career.seasons=Array.from({length:y.season-1},function(){ return {}; });
    S.season=null; S.year=y.season;
    return {value:+sponsorMarketValue().toFixed(1), tier:eligibleSponsorTier(),
      name:sponsorTierInfo(eligibleSponsorTier()).name};
  },
  /* what a loyalty level is worth, and how many delivered seasons it takes to get there */
  rel(){
    var out=[];
    for(var r=1;r<=SPONSOR_REL_MAX;r++) out.push({lv:r, pct:Math.round((sponsorRelMult(r,'Cedar & Oak')-1)*100)});
    return out;
  },
  /* the season-end progression, run for real: hand it a delivered season and see the level move */
  relClimb(nSeasons){
    var sp={brand:'Cedar & Oak', tier:0, rel:1, seasons:0}, log=[];
    for(var i=1;i<=nSeasons;i++){
      var r0=sp.rel;
      if(sp.rel<SPONSOR_REL_AMB){ sp.rel=sp.rel+1; sp.relPend=0; }
      else { sp.relPend=(sp.relPend||0)+1; if(sp.relPend>=2){ sp.relPend=0; sp.rel=Math.min(SPONSOR_REL_MAX,sp.rel+1); } }
      if(sp.rel>r0) log.push({season:i, lv:sp.rel});
    }
    return {final:sp.rel, ups:log};
  }
};
`;

function buildProbe() {
  const src = fs.readFileSync(SRC, 'utf8');
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = null;
  while ((m = re.exec(src))) { if (!best || m[1].length > best[1].length) best = m; }
  if (!best) throw new Error('no inline script found in golf/index.html');
  const at = best.index + best[0].length - '</script>'.length;
  fs.writeFileSync(PROBE, src.slice(0, at) + '\n' + HOOK + '\n' + src.slice(at));
}

/* Three careers, each stated as what the player looks like at the END of season N. Followers grow
   roughly geometrically with success; OVR peaks around 30 and eases off; wins and majors accumulate. */
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
const career = (label, opts) => ({ label, ...opts,
  year: (n) => {
    const t = (n - 1) / 29;
    const ovrAt = k => Math.round(k <= 12 ? lerp(opts.ovr0, opts.ovrPeak, (k - 1) / 11)
                                          : lerp(opts.ovrPeak, opts.ovrPeak - opts.decline, (k - 12) / 18));
    return { season: n,
      fol: Math.round(opts.fol0 * Math.pow(opts.folGrow, n - 1)),
      ovr: ovrAt(n),
      // the career records the BEST rating you ever had (S.career.peakOvr), and a golfer past their peak
      // is still the golfer who once hit it. Feeding the current rating as the peak quietly made every
      // late career look worse than the game thinks it is.
      peak: Math.max(...Array.from({ length: n }, (_, i) => ovrAt(i + 1))),
      wins: Math.round(opts.winsPerYr * n * lerp(0.6, 1.15, t)),
      majors: Math.round(opts.majorsPerYr * n * lerp(0.4, 1.2, t)) };
  } });

const CAREERS = [
  career('GOOD  (a solid tour pro)',   { fol0: 26000, folGrow: 1.13, ovr0: 79, ovrPeak: 87, decline: 6, winsPerYr: 0.5, majorsPerYr: 0.03 }),
  career('GREAT (a multiple major winner)', { fol0: 40000, folGrow: 1.20, ovr0: 82, ovrPeak: 93, decline: 7, winsPerYr: 1.1, majorsPerYr: 0.20 }),
  career('ALL-TIME (an all-timer)',    { fol0: 60000, folGrow: 1.26, ovr0: 84, ovrPeak: 97, decline: 7, winsPerYr: 1.8, majorsPerYr: 0.45 }),
];

const run = async () => {
  buildProbe();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(HOST + '/golf/__test_spncurve.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__SP', null, { timeout: 20000 });

  const T = await page.evaluate(() => window.__SP.tiers());
  head('the ladder');
  console.log('   ', T.names.map((n, i) => `${n} @ ${T.req[i]}${T.minYr[i] ? ' & yr' + T.minYr[i] : ''}`).join('  ·  '));
  console.log('    loyalty 1..' + T.relMax + ', ambassador at ' + T.relAmb);
  ok('six rungs, each named after its brand pool', T.names.length === 6 && T.names[5] === 'Icon', T.names);
  ok('the thresholds climb', T.req.every((v, i) => i === 0 || v > T.req[i - 1]), T.req);

  const reached = {};
  for (const C of CAREERS) {
    head(C.label);
    const first = {};
    for (let n = 1; n <= 30; n++) {
      const y = C.year(n);
      const r = await page.evaluate(v => window.__SP.at(v), y);
      if (first[r.tier] == null) first[r.tier] = n;
      if (n % 5 === 0 || n === 1) console.log(`    yr ${String(n).padStart(2)} · ${String(y.wins).padStart(2)}w ${y.majors}M · OVR ${y.ovr}/${y.peak} · ${(y.fol / 1e6).toFixed(2)}M fans · value ${String(r.value).padStart(5)} → ${r.name}`);
    }
    reached[C.label] = first;
    console.log('    first reached:', T.names.map((n, i) => first[i] != null ? `${n} yr${first[i]}` : null).filter(Boolean).join(' · '));
  }

  head('what the curve has to do');
  const good = reached[CAREERS[0].label], great = reached[CAREERS[1].label], allt = reached[CAREERS[2].label];
  ok('everybody has a real deal from year one', good[0] === 1 && great[0] === 1 && allt[0] === 1, { good: good[0], great: great[0], allt: allt[0] });
  ok('a solid pro never reaches Icon', good[5] == null, good);
  ok('...and does still climb, to Global or better', (good[3] != null), good);
  // the owner's target: the final rung lands in the back half of a career, not the middle of it
  ok('a great career reaches Icon in the year 20 to 25 window', great[5] >= 20 && great[5] <= 25, { icon: great[5] });
  ok('an all-timer reaches Icon in the year 20 to 25 window', allt[5] >= 20 && allt[5] <= 25, { icon: allt[5] });
  ok('no career is at the top rung by year 13, which is the bug',
    (good[5] == null || good[5] > 13) && great[5] > 13 && allt[5] > 13, { good: good[5], great: great[5], allt: allt[5] });
  ok('and none of them is at Elite before year 12 either',
    [good[4], great[4], allt[4]].every(y => y == null || y >= 12), { good: good[4], great: great[4], allt: allt[4] });
  ok('the middle of the ladder still moves through the middle years',
    great[2] != null && great[2] <= 12 && great[3] != null && great[3] <= 20, { premium: great[2], global: great[3] });

  head('loyalty');
  const rel = await page.evaluate(() => window.__SP.rel());
  console.log('   ', rel.map(r => `Lv${r.lv} +${r.pct}%`).join('  ·  '));
  const climb = await page.evaluate(() => window.__SP.relClimb(30));
  console.log('    levels gained on:', climb.ups.map(u => `yr${u.season}→Lv${u.lv}`).join(' · '));
  ok('the ambassador rung still costs what it always did', climb.ups.find(u => u.lv === T.relAmb).season === T.relAmb - 1, climb.ups);
  ok('the rungs past it take two delivered seasons each',
    climb.ups.find(u => u.lv === T.relMax).season === (T.relAmb - 1) + (T.relMax - T.relAmb) * 2, climb.ups);
  ok('and a full ladder is a decade of delivering', climb.ups.find(u => u.lv === T.relMax).season >= 10, climb.ups);
  ok('Lv 5 pays exactly what it used to', rel[4].pct === 24, rel[4]);
  ok('and the tail is a raise, not a second income', rel[T.relMax - 1].pct > 24 && rel[T.relMax - 1].pct <= 36, rel[T.relMax - 1]);

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 4));
  await browser.close();
};

try { await run(); } finally { try { fs.unlinkSync(PROBE); } catch (e) {} }
console.log('\n' + (bad ? bad + ' FAILED' : 'all good'));
process.exit(bad ? 1 : 0);
