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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planPlay, verify } from '../../3d/inplay-plan.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKS = path.resolve(HERE, '..', '..', 'data', 'packs');
const ALL = process.argv.includes('--all');
const SHOW = +(process.argv[process.argv.indexOf('--show') + 1] || 0) || 0;
const KEYS_IP = ['single', 'double', 'triple', 'home_run', 'error', 'out_ground', 'out_line', 'out_fly', 'out_popup'];

let plays = 0, fails = 0;
const byKind = {}, problems = [], durs = [];
for (const f of fs.readdirSync(PACKS).filter((x) => x.endsWith('.json')).sort()) {
  const pack = JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8'));
  const keys = pack.keys, P = pack.pitches, bats = pack.scenario.batters;
  // the real batted balls of each key, with the hand of a hitter who drew it
  const balls = {};
  pack.library.forEach((lib, bi) => {
    for (const e of Object.values(lib)) for (const row of e.x) row.forEach((ref, k) => {
      if (ref == null || ref < 0 || !KEYS_IP.includes(keys[k])) return;
      const i = Math.floor(ref / 3);
      (balls[keys[k]] ||= new Map()).set(i, bats[bi % bats.length].bats);
    });
  });
  let packFails = 0, packPlays = 0;
  for (const key of KEYS_IP) {
    // the rows, once per (bases before, label, moves): the outs before change nothing on the field
    const rows = [], seen = new Set();
    for (const [st, rr] of Object.entries(pack.advance[key] || {})) for (const r of rr) {
      const k = (+st & 7) + '|' + r[4] + '|' + JSON.stringify(r[5]);
      if (!ALL && seen.has(k)) continue;
      seen.add(k); rows.push({ st: +st, r });
    }
    const bl = [...(balls[key] || new Map()).entries()];
    if (!rows.length || !bl.length) continue;
    const pairs = [];
    if (ALL) { for (const b of bl) for (const r of rows) pairs.push([b, r]); }
    else {
      bl.forEach((b, i) => pairs.push([b, rows[i % rows.length]]));
      const spread = spreadOf(bl, P);
      for (const r of rows) for (const b of spread) pairs.push([b, r]);
    }
    for (const [[pi, hand], { st, r }] of pairs) {
      const [, nb, runs, oa, label, moves] = r;
      const outs0 = st >> 3, bases0 = st & 7;
      const pt = P[pi];
      const pr = {
        result: 'in_play', inPlay: { bb: pt[3], ev: pt[4], la: pt[5], spray: pt[6], result: label || 'out' },
        runnerMoves: (moves || []).map(([from, to]) => ({ from, to })), bases: nb, outs: Math.min(3, outs0 + oa), runs, drawn: { id: pt[0] },
      };
      let bad;
      try {
        const plan = planPlay(pr, { bats: hand, basesBefore: bases0, id: pt[0] });
        bad = verify(pr, plan);
        durs.push(plan.realDur);
      } catch (e) { bad = ['threw: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')]; }
      plays++; packPlays++;
      const kk = `${key}/${label}`;
      byKind[kk] ||= { n: 0, bad: 0 };
      byKind[kk].n++;
      if (bad.length) {
        fails++; packFails++; byKind[kk].bad++;
        if (problems.length < 4000) problems.push({ pack: f, key, label, st, moves: JSON.stringify(moves), ball: JSON.stringify(pt.slice(3)), bad });
      }
    }
  }
  console.log(`${packFails ? 'FAIL' : 'ok  '} ${f}: ${packPlays} plays, ${packFails} wrong`);
}

function spreadOf(bl, P) {
  const pick = new Set();
  const by = (fn) => [...bl].sort((a, b) => fn(P[a[0]]) - fn(P[b[0]]));
  for (const fn of [(p) => p[4] ?? 0, (p) => p[5] ?? 0, (p) => p[6] ?? 0]) {
    const s = by(fn);
    for (const q of [0, 1]) pick.add(s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]);
  }
  pick.add(bl[Math.floor(bl.length / 2)]);
  const nul = bl.find((b) => P[b[0]][4] == null || P[b[0]][5] == null || P[b[0]][6] == null);
  if (nul) pick.add(nul);
  return [...pick];
}

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
