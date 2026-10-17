/* Shut The Door: the closer pool, run through a scenario with the engine.
 *
 * Node only, at build time (the page never loads it):
 *   node shut-the-door/pool.js <staged pack.json> <closers.json> <out pack.json> [--runs 2000] [--pros cache/pros.json]
 *
 * What it does to a staged pack (pipeline/build_packs.py writes those):
 *   1. solves hold% for every state under best play (grade.js) and stores the
 *      dense table as pack.hold, so the browser grades from the table
 *   2. plays every real closer's policy (pipeline/closer_pool.py) through the
 *      scenario, with the engine, at least --runs outings in all, and keeps
 *      the sorted outing scores as pack.pool.scores
 *   3. keeps each closer's name, style vector and reason as pack.pool.closers,
 *      for pitched like
 *   4. keeps the lesson's pro examples this pack can show (attachPros)
 *   5. reports the calibration the brief asks for (band spread, the pool's
 *      hold rate) in pack.build.pool, and writes the pack minified
 *
 * A CLOSER'S CALL
 *   His pitch family from his share by count bucket; the scenario pitcher's
 *   pitch of that family (the most used one; a family he lacks goes to the
 *   nearest he has: offspeed to breaking to hard); the target from where that
 *   closer's pitches of that family went in that count, in the batter-relative
 *   grid, mirrored back for a left-handed batter, with his misses taken out
 *   first (aimOf below), since the engine adds this pitcher's miss on top.
 *   The policy draws from its own seeded stream, never the outing's.
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

/* WHERE HE AIMED, NOT WHERE IT WENT. A closer's location table is where his
   pitches crossed, which already holds his misses, and the engine adds this
   pitcher's miss on top. So the aim is recovered first: Richardson-Lucy
   deconvolution of the crossing table through the league-average miss table
   (BASE_SIGMA_FT, the pack's zone height), 40 rounds, which keeps it a
   probability over the 25 cells. Cached per closer and pack. */
const BASE_SIGMA_FT = 0.45;
const aims = new WeakMap();
function deconvolve(seen, ker) {
  let t = seen.slice();
  for (let it = 0; it < 40; it++) {
    const blur = new Array(25).fill(0);
    for (let a = 0; a < 25; a++) for (let b = 0; b < 25; b++) blur[b] += t[a] * ker[a * 25 + b];
    const next = new Array(25).fill(0);
    for (let a = 0; a < 25; a++) {
      let s = 0;
      for (let b = 0; b < 25; b++) if (blur[b] > 0) s += ker[a * 25 + b] * seen[b] / blur[b];
      next[a] = t[a] * s;
    }
    const z = next.reduce((x, y) => x + y, 0) || 1;
    t = next.map(x => x / z);
  }
  return t;
}
function aimOf(closer, pack) {
  let byPack = aims.get(closer);
  if (!byPack) { byPack = new Map(); aims.set(closer, byPack); }
  if (byPack.has(pack)) return byPack.get(pack);
  const ker = G.kernelFor(BASE_SIGMA_FT, pack.kernelZoneFt);
  const out = closer.loc.map(fam => fam.map(row => deconvolve(row, ker)));
  byPack.set(pack, out);
  return out;
}

function closerCall(closer, o, rng) {
  const st = o.st;
  const bk = G.bucketOf(st.b, st.s);
  const fi = pick(closer.fam[bk], rng());
  const type = typeForFamily(o.pack.scenario.pitcher.arsenal, FAMS[fi]);
  let cell = pick(aimOf(closer, o.pack)[fi][bk], rng());
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

/* The pro examples this pack can use (CONTRACT.md section 15). A lesson's pro
   matches the best call's family and batter-relative cell (or a neighbour), in
   the state's count bucket and platoon. The best calls of every state are in
   the hold table, so only rows within one cell of one of those can ever be
   shown: those are kept, and the rest stay out of the download. */
function attachPros(pack, pros, model) {
  if (!pros) return;
  const thr = pack.scenario.pitcher.throws;
  const want = new Map();             // bucket|platoon|family -> Set(rel cells)
  const h = pack.hold;
  for (let bi = 0; bi < model.N; bi++) {
    const bats = pack.scenario.batters[bi].bats;
    const platoon = bats === thr ? 'same' : 'opp';
    for (let b = 0; b < 4; b++) for (let s = 0; s < 3; s++) for (let o = 0; o < 3; o++) for (let bs = 0; bs < 8; bs++)
      for (let m = 1; m <= model.M; m++) {
        const i = G.stateIndex(model.N, model.M, bi, b, s, o, bs, m);
        const bc = h.b[i];
        if (bc == null) continue;
        const type = model.types[Math.floor(bc / 25)], cell = bc % 25;
        const rel = bats === 'L' ? K.rowOf(cell) * 5 + (4 - K.colOf(cell)) : cell;
        const key = `${G.BUCKETS[G.bucketOf(b, s)]}|${platoon}|${K.FAMILY_OF[type]}`;
        if (!want.has(key)) want.set(key, new Set());
        want.get(key).add(rel);
      }
  }
  const near = (a, set) => { for (const c of set) if (Math.max(Math.abs(K.rowOf(a) - K.rowOf(c)), Math.abs(K.colOf(a) - K.colOf(c))) <= 1) return true; return false; };
  const rows = {}, pi = new Map(), bi2 = new Map(), pitchers = [], batters = [];
  for (const [key, list] of Object.entries(pros.rows)) {
    const rest = key.slice(key.indexOf('|') + 1);
    const set = want.get(rest);
    if (!set) continue;
    const kept = [];
    for (const r of list) {
      const rel = r[10] === 'L' ? K.rowOf(r[9]) * 5 + (4 - K.colOf(r[9])) : r[9];
      if (!near(rel, set)) continue;
      const pn = pros.pitchers[r[0]], bn = pros.batters[r[1]];
      if (!pi.has(pn)) { pi.set(pn, pitchers.length); pitchers.push(pn); }
      if (!bi2.has(bn)) { bi2.set(bn, batters.length); batters.push(bn); }
      kept.push([pi.get(pn), bi2.get(bn)].concat(r.slice(2)));
    }
    if (kept.length) rows[key] = kept;
  }
  pack.pros = { pitchers, batters, rows };
}

function build(pack, closersFile, opts) {
  const runs = (opts && opts.runs) || 2000;
  const t0 = Date.now();
  const fresh = new G.Model(pack, { fresh: true });
  pack.hold = fresh.holdTable();
  const solveMs = Date.now() - t0;
  const model = new G.Model(pack);
  attachPros(pack, opts && opts.pros, model);
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
  const prosAt = a.indexOf('--pros');
  const pros = prosAt >= 0 && fs.existsSync(a[prosAt + 1]) ? JSON.parse(fs.readFileSync(a[prosAt + 1], 'utf8')) : null;
  const [inPath, closersPath, outPath] = a.filter((x, i) => !x.startsWith('--') && a[i - 1] !== '--runs' && a[i - 1] !== '--pros');
  const pack = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const closers = JSON.parse(fs.readFileSync(closersPath, 'utf8'));
  build(pack, closers, { runs, pros });
  fs.writeFileSync(outPath, JSON.stringify(pack));
  const b = pack.build;
  console.log(`${pack.scenario.id}: ${(fs.statSync(outPath).size / 1e6).toFixed(2)} MB, start hold ${b.startHold}%, ` +
    `pool ${b.pool.runs} runs, hold rate ${b.pool.holdRate}, bands ${JSON.stringify(b.pool.bands)}, solve ${b.solveMs} ms`);
}

if (NODE) module.exports = { build, runPool, closerCall, typeForFamily, bandsOf };
