/* The coach's report card: that the words mean something, and that the bar and the
 * penalty are the same fact.
 *
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_report_card.mjs
 *
 * WHY THIS EXISTS. A player drafted Collin Klein, 2011 Kansas State, the top price the
 * game sells at $4.8M and the 99th percentile of his position, and the panel said
 * "Quarterback: WEAK" under a badge reading DUAL THREAT. It was grading the 9 points he
 * throws for and ignoring the 22 he runs for.
 *
 * Underneath that was a worse problem. The four meters scored themselves in the page,
 * with different tolerances from the engine they were describing: the run and pass meter
 * used a span of 0.20 where balance() uses a tolerance of 0.12, so on 15.5% of drafted
 * rosters it drew a red bar for a split the engine charges nothing at all for. Measured
 * in cfb/build/test/probe_report.mjs, which is also where the numbers below come from.
 *
 * So the page scores nothing now: every line reads E.structureCosts(), which is what the
 * engine multiplies the roster by. This holds that line.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const R = require(ROOT + '/cfb/run.js');
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/cfb/data/' + f, 'utf8'));
const players = rd('cfb_player_seasons.json');
const data = R.indexData(players, rd('cfb_team_seasons.json'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

console.log('=== the arithmetic the panel claims ===');
/* Each line says "putting this right would be worth N%". Put ALL of them right at once
   and the roster should score what it would with a perfect shape, which is 1 plus
   whatever the scheme pays. The four are measured one at a time against a product, so
   they do not add up exactly; what matters is that they do not lie about the size. */
const sample = [];
for (let i = 0; i < 400; i++) {
  const run = R.createRun({ seed: i * 977 + 3 });
  let okRun = true;
  for (let s = 0; s < 6; s++) {
    let draw;
    try { draw = R.spin(run, data); } catch (e) { okRun = false; break; }
    const list = data.playersByTeamSeason[draw.team_season_id] || [];
    const opts = draw.options.map((k) => { const [id, se] = k.split('|');
      return list.find((p) => String(p.player_id) === id && String(p.season) === se); })
      .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    if (!opts.length) { okRun = false; break; }
    R.sign(run, opts[i % opts.length]);
  }
  if (okRun && run.roster.length === 6) sample.push(run.roster);
}
ok('enough rosters to measure', sample.length > 200, String(sample.length) + ' drafted');

let worstGap = 0;
for (const roster of sample) {
  const st = E.rosterStructure(roster);
  const c = E.structureCosts(st);
  const claimed = c.pass + c.balance + c.concentration + c.floor;
  /* What a perfect shape is worth, straight off the engine. */
  const perfect = 1 + (st.schemeBonus || 0);
  const actual = perfect - st.multiplier;
  worstGap = Math.max(worstGap, Math.abs(claimed - actual));
}
ok('the four costs account for the whole shortfall, within a point',
  worstGap < 0.01, 'worst disagreement ' + (worstGap * 100).toFixed(2) + '%');

console.log('\n=== the words are earned, and all three get used ===');
const counts = { strong: 0, ok: 0, weak: 0 };
const perRow = {};
for (const roster of sample) {
  const c = E.structureCosts(E.rosterStructure(roster));
  for (const [k, v] of Object.entries(c)) {
    const b = E.reportBand(v);
    counts[b]++;
    (perRow[k] ||= { strong: 0, ok: 0, weak: 0 })[b]++;
  }
}
ok('every band is reachable', counts.strong > 0 && counts.ok > 0 && counts.weak > 0,
  JSON.stringify(counts));
for (const [k, v] of Object.entries(perRow)) {
  const n = v.strong + v.ok + v.weak;
  ok(k.padEnd(14) + 'is not stuck on one word', Math.max(v.strong, v.ok, v.weak) / n < 0.95,
    'strong ' + (100 * v.strong / n).toFixed(0) + '%  ok ' + (100 * v.ok / n).toFixed(0)
    + '%  weak ' + (100 * v.weak / n).toFixed(0) + '%');
}
/* And the thing the old scoring got wrong: a bar going red over a penalty that is not
   there. By construction now, so this is the guard on the construction. */
let phantom = 0;
for (const roster of sample) {
  const st = E.rosterStructure(roster);
  const c = E.structureCosts(st);
  for (const v of Object.values(c)) if (E.reportBand(v) === 'weak' && v < E.REPORT_BANDS.weak) phantom++;
}
ok('nothing reads Weak without costing what Weak means', phantom === 0, String(phantom));

console.log('\n=== the roster that was reported ===');
const f = (n, s, sc) => players.find((p) => p.name === n && p.season === s && (!sc || p.school === sc));
const reported = [f('Collin Klein', 2011), f('Nick Hill', 2014, 'Michigan State'),
  f('Jeff Smith', 2015, 'Boston College'), f('Travis Rudolph', 2016),
  f('Jarvis Williams', 2009), f('Jazz Peavy', 2016)];
ok('the six players are all in the file', reported.every(Boolean));
if (reported.every(Boolean)) {
  const st = E.rosterStructure(reported);
  const c = E.structureCosts(st);
  const klein = reported[0];
  console.log('  Collin Klein 2011: $' + klein.price_musd + 'M, ' + klein.fppg + ' fppg, '
    + klein.pass_ppg + ' passing and ' + klein.rush_ppg + ' rushing, '
    + (klein.position_percentile * 100).toFixed(1) + 'th percentile');
  ok('the passing line no longer calls this roster weak', E.reportBand(c.pass) !== 'weak',
    E.reportBand(c.pass) + ', costing ' + (c.pass * 100).toFixed(1) + '%');
  ok('and the panel still reports the split it really has',
    Math.round(st.rushShare * 100) === 53 && Math.round(st.topShare * 100) === 33,
    Math.round(st.rushShare * 100) + '% run, ' + Math.round(st.topShare * 100) + '% through one');
}

console.log('\n=== a big-name rushing quarterback is never marked down for his legs ===');
/* Thirty-one quarterbacks in the game are priced at $4M or more AND run for more than
   they throw for: Lamar Jackson, Cam Newton, Johnny Manziel, Denard Robinson, Klein. The
   line charges for receivers left stranded, so with nobody expensive to strand it should
   charge nothing. */
const runners = players.filter((p) => p.position === 'QB' && p.price_musd >= 4
  && (p.rush_ppg || 0) > (p.pass_ppg || 0));
ok('there are such quarterbacks to check', runners.length > 10, String(runners.length));
const cheapWR = players.filter((p) => p.position === 'WR').sort((a, b) => a.price_musd - b.price_musd);
const cheapRB = players.filter((p) => p.position === 'RB').sort((a, b) => a.price_musd - b.price_musd);
let marked = 0;
for (const qb of runners) {
  const roster = [qb, cheapRB[0], cheapWR[0], cheapWR[1], cheapWR[2], cheapWR[3]];
  const c = E.structureCosts(E.rosterStructure(roster));
  if (E.reportBand(c.pass) === 'weak') marked++;
}
ok('none of them reads Weak on the passing line with nobody to strand', marked === 0,
  marked + ' of ' + runners.length);

console.log('\n=== and it draws ===');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(() => { try { localStorage.setItem('cfb_arcade_ad_off', '1'); } catch (e) {} });
await p.goto('http://localhost:8081/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(2500);
await p.evaluate(() => document.getElementById('b-play-intro').click());
for (let i = 0; i < 9; i++) {
  if (await p.evaluate(() => document.getElementById('s-squad').classList.contains('on'))) break;
  await p.waitForSelector('#opts .tile:not(.off)', { timeout: 20000 }).catch(() => {});
  const hit = await p.evaluate(() => {
    const t = [...document.querySelectorAll('#opts .tile:not(.off)')];
    if (!t.length) return false; t[0].click(); return true;
  });
  if (!hit) break;
  await p.waitForTimeout(1000);
  await p.evaluate(() => { const s = document.querySelector('#sheet-in .slotopt'); if (s) s.click(); });
  await p.waitForTimeout(500);
}
await p.waitForSelector('#s-squad.on', { timeout: 30000 });
await p.waitForTimeout(1000);
const panel = (await p.textContent('#q-panel')).replace(/\s+/g, ' ');
ok('four lines, each with a bar and a reason', await p.evaluate(() =>
  document.querySelectorAll('#q-meters .meter').length === 4
  && document.querySelectorAll('#q-meters .track i').length === 4
  && document.querySelectorAll('#q-meters .why').length === 4));
ok('every line says what it costs or that it costs nothing',
  await p.evaluate(() => [...document.querySelectorAll('#q-meters .why')]
    .every((e) => /costs you nothing|costs you [\d.]+%|adds [\d.]+%/.test(e.textContent))),
  panel.slice(0, 0) || undefined);
ok('every line says where the free range ends',
  await p.evaluate(() => [...document.querySelectorAll('#q-meters .why')]
    .every((e) => /is free|of their own numbers/.test(e.textContent))));
ok('the line that adds them up is always there, scheme or no scheme',
  /Add those four up/.test(panel), (await p.textContent('#q-fit')).trim().slice(0, 80));
ok('the quarterback line is named for the passing game', /Passing game/.test(panel)
  && !/\bQuarterback\b/.test(panel));
/* "Spread" was also the name of one of the offensive schemes, so a roster running the
   Spread Offense had a meter called Spread that meant something else entirely. */
ok('no meter borrows a scheme name', !/(^|\s)Spread(\s|$)/.test(
  await p.evaluate(() => [...document.querySelectorAll('#q-meters .lbl')].map((e) => e.textContent).join(' '))));
const geo = await p.evaluate(() => {
  const doc = document.documentElement;
  return { over: [...document.querySelectorAll('#q-panel *')]
    .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1).length,
    sw: doc.scrollWidth, cw: doc.clientWidth };
});
ok('nothing runs off the side of the phone', geo.over === 0 && geo.sw <= geo.cw + 1, JSON.stringify(geo));
ok('nothing logged', errs.length === 0, errs.join(' | ') || 'none');
await p.screenshot({ path: (process.env.SS || '/tmp/') + 'report_card.png' });
await b.close();

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
