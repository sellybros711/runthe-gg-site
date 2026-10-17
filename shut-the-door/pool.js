/* Shut The Door: the closer pool, run through a scenario with the engine.
 *
 * Node only, at build time (the page never loads it):
 *   node shut-the-door/pool.js <staged pack.json> <closers.json> <out pack.json> [--runs 2000]
 *
 * What it does to a staged pack (pipeline/build_packs.py writes those):
 *   1. solves hold% for every state under best play (grade.js) and stores the
 *      dense table as pack.hold, so the browser grades from the table
 *   2. plays every real closer's policy (pipeline/closer_pool.py) through the
 *      scenario, with the engine, at least --runs outings in all, and keeps
 *      the sorted outing scores as pack.pool.scores
 *   3. keeps each closer's name, style vector and reason as pack.pool.closers,
 *      for pitched like
 *   4. reports the calibration the brief asks for (band spread, the pool's
 *      hold rate) in pack.build.pool, and writes the pack minified
 *
 * A CLOSER'S CALL
 *   His pitch family from his share by count bucket; the scenario pitcher's
 *   pitch of that family (the most used one; a family he lacks goes to the
 *   nearest he has: offspeed to breaking to hard); the target from where that
 *   closer's pitches of that family went in that count, in the batter-relative
 *   grid, mirrored back for a left-handed batter. Where his pitches went is
 *   used as where he aimed, so the engine's miss is added on top: the pool is
 *   a little wilder than the men in it were. The policy draws from its own
 *   seeded stream, never the outing's.
 */

'use strict';

const NODE = typeof module !== 'undefined' && module.exports;
const K = require('./contract.js');
const R = require('./rng.js');
const G = require('./grade.js');
const E = require('./engine.js');

const FAMS = ['hard', 'breaking', 'offspeed'];
const FALLBACK = { hard: ['hard', 'breaking', 'offspeed'], breaking: ['breaking', 'offspeed', 'hard'], offspeed: ['offspeed', 'breaking', 'hard'] };

function pick(probs, u) {
  let acc = 0;
  for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (u < acc) return i; }
  return probs.length - 1;
}

function typeForFamily(arsenal, fam) {
  for (const f of FALLBACK[fam]) {
    const own = arsenal.filter(a => K.FAMILY_OF[a.type] === f).sort((a, b) => b.usage - a.usage);
    if (own.length) return own[0].type;
  }
  return arsenal[0].type;
}

function closerCall(closer, o, rng) {
  const st = o.st;
  const bk = G.bucketOf(st.b, st.s);
  const fi = pick(closer.fam[bk], rng());
  const type = typeForFamily(o.pack.scenario.pitcher.arsenal, FAMS[fi]);
  let cell = pick(closer.loc[fi][bk], rng());
  const bats = o.pack.scenario.batters[st.bi % o.model.N].bats;
  if (bats === 'L') cell = K.rowOf(cell) * 5 + (4 - K.colOf(cell));
  return { type, cell };
}

function runPool(pack, closers, runs, model) {
  const per = Math.ceil(runs / closers.length);
  const scores = [];
  const lostAll = [];
  let holds = 0, n = 0, pitches = 0;
  const outcomes = { door_shut: 0, doors_open: 0, walk_off: 0 };
  closers.forEach((c, ci) => {
    for (let r = 0; r < per; r++) {
      const seed = R.hashSeed(`${pack.scenario.id}|pool|${ci}|${r}`);
      const policy = R.mulberry32(R.hashSeed(`${pack.scenario.id}|policy|${ci}|${r}`));
      const o = E.createOuting(pack, { seed, mode: 'practice', model });
      let guard = 0;
      while (o.status === 'live' && guard++ < 150) E.throwPitch(o, closerCall(c, o, policy));
      if (o.status !== 'over') continue;
      scores.push(E.outingScore(o));
      for (const g of o.grades) lostAll.push(g.lost);
      outcomes[o.outcome]++;
      if (o.outcome === 'door_shut') holds++;
      n++;
      pitches += o.log.length;
    }
  });
  scores.sort((a, b) => a - b);
  return { scores, lostAll, holdRate: holds / n, outcomes, runs: n, meanPitches: pitches / n };
}

function bandsOf(lostList) {
  const out = { green: 0, yellow: 0, orange: 0, red: 0 };
  for (const l of lostList) out[K.bandOf(l)]++;
  return out;
}

function quantiles(xs, qs) {
  const s = xs.slice().sort((a, b) => a - b);
  return qs.map(q => s[Math.min(s.length - 1, Math.floor(q * s.length))]);
}

function build(pack, closersFile, opts) {
  const runs = (opts && opts.runs) || 2000;
  const t0 = Date.now();
  const fresh = new G.Model(pack, { fresh: true });
  pack.hold = fresh.holdTable();
  const solveMs = Date.now() - t0;
  const model = new G.Model(pack);
  const closers = closersFile.closers;
  const pool = runPool(pack, closers, runs, model);
  pack.pool = {
    scores: pool.scores,
    closers: closers.map(c => ({ name: c.name, vec: c.vec, reason: c.reason })),
  };
  const start = model.solve(model.startState());
  pack.build = Object.assign(pack.build || {}, {
    pool: {
      runs: pool.runs, closers: closers.length, holdRate: Math.round(pool.holdRate * 1000) / 1000,
      outcomes: pool.outcomes, meanPitches: Math.round(pool.meanPitches * 10) / 10,
      bands: bandsOf(pool.lostAll), lostQuantiles: quantiles(pool.lostAll, [0.25, 0.5, 0.75, 0.9, 0.97]),
      scoreQuantiles: quantiles(pool.scores, [0.1, 0.25, 0.5, 0.75, 0.9]),
    },
    startHold: Math.round(start.hold * 10000) / 100,
    solveMs,
  });
  return pack;
}

if (NODE && require.main === module) {
  const fs = require('fs');
  const a = process.argv.slice(2);
  const runsAt = a.indexOf('--runs');
  const runs = runsAt >= 0 ? +a[runsAt + 1] : 2000;
  const [inPath, closersPath, outPath] = a.filter((x, i) => !x.startsWith('--') && a[i - 1] !== '--runs');
  const pack = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const closers = JSON.parse(fs.readFileSync(closersPath, 'utf8'));
  build(pack, closers, { runs });
  fs.writeFileSync(outPath, JSON.stringify(pack));
  const b = pack.build;
  console.log(`${pack.scenario.id}: ${(fs.statSync(outPath).size / 1e6).toFixed(2)} MB, start hold ${b.startHold}%, ` +
    `pool ${b.pool.runs} runs, hold rate ${b.pool.holdRate}, bands ${JSON.stringify(b.pool.bands)}, solve ${b.solveMs} ms`);
}

if (NODE) module.exports = { build, runPool, closerCall, typeForFamily, bandsOf };
