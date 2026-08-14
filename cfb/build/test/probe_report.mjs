/* What the coach's report card actually says, over a few thousand real drafts.
 *
 *   node cfb/build/test/probe_report.mjs
 *
 * A player looked at a $4.8M quarterback, the most expensive tier the game sells, and
 * read "Quarterback: WEAK" underneath a badge saying DUAL THREAT. That is Collin Klein,
 * 2011 Kansas State: 31.1 fantasy points a game, 98.9th percentile, of which 22.2 come
 * from his legs and 9.0 from his arm. The card was grading his arm and calling it him.
 *
 * KEPT AS THE BEFORE AND AFTER. The PAGE block below is the scoring index.html used to
 * do, preserved so the two can be compared in one run; the cost block at the end reads
 * the shipped engine. Delete the first only when nobody needs to see what was wrong.
 *
 * So this measures two things:
 *
 *   WHAT THE BANDS DO. Weak/OK/Strong are cut at 0.45 and 0.75 on scores the page
 *   computes for itself. If almost every roster lands in one band the words carry no
 *   information, and if a band is unreachable it is a lie.
 *
 *   WHETHER THE BAR MATCHES THE PENALTY. Three of the four meters re-derive their own
 *   curve instead of reading the term the engine actually multiplies by, with different
 *   tolerances. Where those disagree, the bar is not showing the player what it costs.
 */
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
const league = rd('cfb_league_context.json');

const STRATS = {
  greedy: (o) => o.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)),
  value: (o) => o.reduce((b, p) => (p.ppr_ppg_mean / Math.max(0.1, p.price_musd)
    > b.ppr_ppg_mean / Math.max(0.1, b.price_musd) ? p : b)),
  random: (o) => o[Math.floor(Math.random() * o.length)],
};

function draft(pick) {
  const run = R.createRun({});
  for (let i = 0; i < 14 && run.roster.length < E.SLOTS.length; i++) {
    let draw;
    try { draw = R.spin(run, data); } catch (e) { return null; }
    const list = data.playersByTeamSeason[draw.team_season_id] || [];
    const opts = draw.options
      .map((k) => { const [id, s] = k.split('|');
        return list.find((p) => String(p.player_id) === id && String(p.season) === s); })
      .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    if (!opts.length) return null;
    R.sign(run, pick(opts));
  }
  if (run.roster.length !== E.SLOTS.length) return null;
  return run;
}

/* The page's own four scores, copied here exactly as index.html computes them, so this
   measures what ships rather than what it ought to be. */
const span = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
const PAGE = {
  Quarterback: (st) => span(st.qbSupport, 0.70, 1.12),
  'Run and pass': (st) => 1 - Math.min(1, Math.abs(st.rushShare - 0.34) / 0.20),
  Spread: (st) => 1 - Math.min(1, Math.max(0, st.topShare - 0.24) / 0.20),
  Depth: (st) => span(st.floorShare, 0.14, 0.64),
};
/* The terms the engine multiplies the roster by. These are what a meter is supposed to
   be showing, and three of the four above are not reading them. */
const ENGINE = {
  Quarterback: (st) => st.qbSupport,
  'Run and pass': (st) => st.balance,
  Spread: (st) => st.concentration,
  Depth: (st) => st.floor,
};
const bandOf = (v) => (v >= 0.75 ? 'Strong' : v >= 0.45 ? 'OK' : 'Weak');

const rows = [];
for (const [name, pick] of Object.entries(STRATS)) {
  for (let i = 0; i < 700; i++) {
    const run = draft(pick);
    if (!run) continue;
    const st = E.rosterStructure(run.roster);
    const qb = E.findQB(run.roster);
    rows.push({ strat: name, st, qb, spend: run.roster.reduce((s, p) => s + p.price_musd, 0) });
  }
}
console.log('rosters drafted: ' + rows.length + '\n');

const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
const pct = (n) => (100 * n).toFixed(1) + '%';

console.log('=== where each meter lands, as the page scores it now ===');
console.log('meter          p05    p25    p50    p75    p95     Weak    OK   Strong');
for (const [name, f] of Object.entries(PAGE)) {
  const vals = rows.map((r) => f(r.st));
  const counts = { Weak: 0, OK: 0, Strong: 0 };
  for (const v of vals) counts[bandOf(v)]++;
  console.log(name.padEnd(14)
    + [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => q(vals, p).toFixed(2).padStart(6)).join(' ')
    + '   ' + ['Weak', 'OK', 'Strong'].map((k) => pct(counts[k] / vals.length).padStart(6)).join(' '));
}

console.log('\n=== the same four, as the ENGINE scores them ===');
console.log('(1.00 is no penalty at all; this is the number the roster is multiplied by)');
console.log('term           p05    p25    p50    p75    p95');
for (const [name, f] of Object.entries(ENGINE)) {
  const vals = rows.map((r) => f(r.st));
  console.log(name.padEnd(14)
    + [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => q(vals, p).toFixed(3).padStart(6)).join(' '));
}

console.log('\n=== where the bar and the penalty disagree ===');
/* A meter reading Weak on a term the engine barely penalises, or Strong on one it
   punishes, is the bar telling a story the game does not act on. */
for (const [name, f] of Object.entries(PAGE)) {
  let mismatch = 0, worst = null;
  for (const r of rows) {
    const shown = f(r.st), real = ENGINE[name](r.st);
    /* "Weak" claims a serious problem. Call it a disagreement when the engine's own
       penalty for that term is under 3%. */
    const bad = bandOf(shown) === 'Weak' && real >= 0.97;
    if (bad) { mismatch++; if (!worst || real > worst.real) worst = { shown, real, r }; }
  }
  console.log(name.padEnd(14) + 'reads Weak while costing under 3%: '
    + pct(mismatch / rows.length).padStart(7)
    + (worst ? '   worst: bar ' + worst.shown.toFixed(2) + ' vs penalty ' + ((1 - worst.real) * 100).toFixed(1) + '%' : ''));
}

console.log('\n=== the quarterback row, split by what the quarterback is ===');
/* The reported case. A rushing quarterback scores his points; the row grades only the
   ones he throws for, so the best of them read as the worst. */
const withQB = rows.filter((r) => r.qb);
const runners = withQB.filter((r) => (r.qb.rush_ppg || 0) > (r.qb.pass_ppg || 0));
const throwers = withQB.filter((r) => (r.qb.rush_ppg || 0) <= (r.qb.pass_ppg || 0));
for (const [label, set] of [['run-first QBs', runners], ['pass-first QBs', throwers]]) {
  if (!set.length) continue;
  const weak = set.filter((r) => bandOf(PAGE.Quarterback(r.st)) === 'Weak').length;
  const fppg = set.map((r) => r.qb.ppr_ppg_mean);
  const price = set.map((r) => r.qb.price_musd);
  console.log(label.padEnd(16) + 'n=' + String(set.length).padEnd(6)
    + 'read Weak: ' + pct(weak / set.length).padStart(7)
    + '   median QB fppg ' + q(fppg, 0.5).toFixed(1)
    + '   median price $' + q(price, 0.5).toFixed(1) + 'M');
}

/* And the specific roster that was reported, priced at the very top of the market. */
const klein = players.find((p) => p.name === 'Collin Klein' && p.season === 2011);
if (klein) {
  const st = E.rosterStructure([klein]);
  console.log('\nCollin Klein 2011, $' + klein.price_musd + 'M, ' + klein.fppg + ' fppg total ('
    + klein.pass_ppg + ' passing, ' + klein.rush_ppg + ' rushing)');
  console.log('  the page scores his row ' + PAGE.Quarterback(st).toFixed(2)
    + ' -> ' + bandOf(PAGE.Quarterback(st))
    + ', on a QB in the ' + (klein.position_percentile * 100).toFixed(1) + 'th percentile of his position');
}

console.log('\n=== how often a roster is marked down twice for one player ===');
/* A rushing quarterback drags the passing row down AND pushes the run share up, so the
   same man is charged for on two lines. */
const both = rows.filter((r) => bandOf(PAGE.Quarterback(r.st)) === 'Weak'
  && bandOf(PAGE['Run and pass'](r.st)) === 'Weak'
  && r.qb && (r.qb.rush_ppg || 0) > (r.qb.pass_ppg || 0));
console.log('rosters where a run-first QB reads Weak on both rows: ' + pct(both.length / rows.length));

/* ────────────────────────────────────────────────────────────────────────────
   WHAT IT WOULD COST, WHICH IS THE THING WORTH SHOWING.

   shape is a product: base x balance x concentration x floor, and the multiplier is
   1 + (shape-1)*SHAPE_STRENGTH. So for any one factor f, putting it right and leaving
   everything else alone moves the multiplier by shape*(1/f - 1)*SHAPE_STRENGTH. That is
   a straight answer to "what is this row costing me", in the same percent the panel
   already prints at the top, and it is the same unit on all four rows.
   ──────────────────────────────────────────────────────────────────────────── */
/* Read off the shipped engine rather than copied, so this probe cannot quietly measure
   something the game stopped doing. That is the whole bug it was written to find. */
function costs(st) {
  const c = E.structureCosts(st);
  return { 'Passing game': c.pass, 'Run and pass': c.balance, Reliance: c.concentration, Depth: c.floor };
}
console.log('\n=== what each row actually costs, as a share of team scoring ===');
console.log('row            p05    p25    p50    p75    p90    p95    p99    max');
const all = rows.map((r) => costs(r.st));
for (const k of Object.keys(all[0])) {
  const v = all.map((c) => c[k]);
  console.log(k.padEnd(14) + [0.05, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99].map((p) =>
    (q(v, p) * 100).toFixed(1).padStart(6)).join(' ')
    + (Math.max(...v) * 100).toFixed(1).padStart(7));
}

/* Bands on cost, so the same words mean the same thing on every row. Anything under a
   point of scoring is not worth calling a weakness; past four it is the reason the team
   underperforms its parts. */
const COST_OK = E.REPORT_BANDS.ok, COST_BAD = E.REPORT_BANDS.weak;
const costBand = (c) => ({ strong: 'Strong', ok: 'OK', weak: 'Weak' })[E.reportBand(c)];
console.log('\n=== how the bands would fall on cost, at ' + (COST_OK * 100) + '% and '
  + (COST_BAD * 100) + '% ===');
console.log('row             Weak    OK   Strong');
for (const k of Object.keys(all[0])) {
  const counts = { Weak: 0, OK: 0, Strong: 0 };
  for (const c of all) counts[costBand(c[k])]++;
  console.log(k.padEnd(14) + ['Weak', 'OK', 'Strong'].map((x) =>
    pct(counts[x] / all.length).padStart(6)).join(' '));
}

console.log('\n=== and the reported roster, rescored ===');
/* Klein plus the receivers he was actually drafted alongside is the case to look at:
   the passing row should charge for the receivers it strands and no more. */
const bySpread = rows.filter((r) => r.qb && (r.qb.rush_ppg || 0) > (r.qb.pass_ppg || 0)
  && r.qb.price_musd >= 4);
if (bySpread.length) {
  const c = bySpread.map((r) => costs(r.st));
  console.log('rosters built round a $4M+ run-first QB: n=' + bySpread.length);
  for (const k of Object.keys(c[0])) {
    const v = c.map((x) => x[k]);
    const weak = v.filter((x) => costBand(x) === 'Weak').length;
    console.log('  ' + k.padEnd(14) + 'median cost ' + (q(v, 0.5) * 100).toFixed(1)
      + '%   reads Weak ' + pct(weak / v.length));
  }
}
