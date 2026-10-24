/* Every ball in play in every pack, staged by the scene's planner (3d/inplay-plan.js), against what the
 * engine decided: the ball where the result puts it (caught, fielded, fell in, over the wall), every
 * runner on the base his move ends on (or across the plate), every runner put out beaten by the ball,
 * and the whole sequence a few seconds long.
 *
 *   node shut-the-door/lab/pipeline/check-inplay.mjs            every pack in data/packs
 *   node shut-the-door/lab/pipeline/check-inplay.mjs --all      every real batted ball with every row of its kind (slow)
 *   node shut-the-door/lab/pipeline/check-inplay.mjs --show N   print the first N problems in full
 *
 * Each in-play outcome key (single ... out_popup) has real batted balls (the pack's pitches the library
 * points at) and advancement rows for every base and out state (each row a label and the runners'
 * moves). By default every batted ball is planned once (paired with a row of its kind in turn), and
 * every row is planned with a spread of batted balls (the softest, the hardest, the extremes of
 * angle and spray, and a few between), so each ball and each row is covered. The plan is pure, so a
 * failure here is the same failure on screen.
 */
import { planPlay, verify } from '../../3d/inplay-plan.js';
import { inplayCases } from './inplay-cases.mjs';

const ALL = process.argv.includes('--all');
const SHOW = +(process.argv[process.argv.indexOf('--show') + 1] || 0) || 0;

let plays = 0, fails = 0;
const byKind = {}, problems = [], durs = [], perPack = new Map();
for (const c of inplayCases({ all: ALL })) {
  const { pr, key, label, st, moves } = c;
  let bad;
  try {
    const plan = planPlay(pr, { bats: c.hand, basesBefore: c.bases0, id: c.id });
    bad = verify(pr, plan);
    durs.push(plan.realDur);
  } catch (e) { bad = ['threw: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')]; }
  plays++;
  const pp = perPack.get(c.pack) || { n: 0, bad: 0 };
  pp.n++;
  perPack.set(c.pack, pp);
  const kk = `${key}/${label}`;
  byKind[kk] ||= { n: 0, bad: 0 };
  byKind[kk].n++;
  if (bad.length) {
    fails++; pp.bad++; byKind[kk].bad++;
    if (problems.length < 4000) problems.push({ pack: c.pack, key, label, st, moves: JSON.stringify(moves), ball: JSON.stringify(c.ball), bad });
  }
}
for (const [f, pp] of perPack) console.log(`${pp.bad ? 'FAIL' : 'ok  '} ${f}: ${pp.n} plays, ${pp.bad} wrong`);

console.log('\nby kind (outcome key / label): plays, wrong');
for (const [k, v] of Object.entries(byKind).sort()) console.log(`  ${v.bad ? 'FAIL' : 'ok  '} ${k.padEnd(30)} ${String(v.n).padStart(6)} ${v.bad}`);
const why = {};
for (const p of problems) for (const b of p.bad) { const k = b.replace(/[-\d.]+/g, '#'); why[k] = (why[k] || 0) + 1; }
if (Object.keys(why).length) {
  console.log('\nproblems, by kind:');
  for (const [k, n] of Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(n).padStart(6)}  ${k}`);
}
for (const p of problems.slice(0, SHOW)) console.log(JSON.stringify(p));
durs.sort((a, b) => a - b);
const q = (x) => durs[Math.floor(x * (durs.length - 1))].toFixed(1);
console.log(`\nlength on screen (s, after contact): median ${q(0.5)}, 90th ${q(0.9)}, longest ${q(1)}`);
console.log(`\n${plays} plays, ${fails} wrong`);
process.exit(fails ? 1 : 0);
