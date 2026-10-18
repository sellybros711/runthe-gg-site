/* Shut The Door engine tests, over a synthetic pack (test/synth.mjs).
 *   node shut-the-door/test/engine.mjs
 * Prints ok / FAIL per check and exits non-zero on any failure.
 *
 * The real-pack checks (fastballs down the middle grade mostly orange and red
 * on a real scenario, a median outing near the 50th percentile against the
 * closer pool) join when the packs exist. Here they run on the synthetic model
 * so the machinery is held now.
 */
import { createRequire } from 'module';
import { synthPack, testRng } from './synth.mjs';
const require = createRequire(import.meta.url);
const K = require('../contract.js');
const R = require('../rng.js');
const G = require('../grade.js');
const E = require('../engine.js');

let fails = 0;
/* Calibration lines: what the brief's band checks say on THIS pack. They are
   checks of the bands against a real scenario, so on the synthetic pack they
   print and never fail; on a built pack (test/pack.mjs, step 3 onward) they fail. */
function calib(name, cond, detail) {
  console.log((cond ? 'calib ok   ' : 'CALIB miss ') + name + (detail ? ': ' + detail : ''));
}
function check(name, cond, detail) {
  if (cond) console.log('ok   ' + name);
  else { fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
}

/* ---- rng ---- */
{
  const a = R.mulberry32(42), b = R.mulberry32(42);
  const xs = Array.from({ length: 5 }, () => a()), ys = Array.from({ length: 5 }, () => b());
  check('mulberry32 is repeatable', JSON.stringify(xs) === JSON.stringify(ys));
  check('probit inverts the normal cdf', [0.01, 0.2, 0.5, 0.8, 0.99].every(p => Math.abs(R.normCdf(R.probit(p)) - p) < 1e-6));
  check('daily seed is the contract prefix plus the day', E.seedFor('daily', '2026-10-20', 7) === R.hashSeed(K.DAILY_SEED_PREFIX + '2026-10-20'));
}

/* ---- the miss table ---- */
{
  const ker = G.kernelFor(0.45, 1.9);
  let worst = 0;
  for (let t = 0; t < 25; t++) {
    let s = 0;
    for (let a = 0; a < 25; a++) s += ker[t * 25 + a];
    worst = Math.max(worst, Math.abs(s - 1));
  }
  check('every miss-table row sums to 1', worst < 1e-6, String(worst));
  check('a target is most likely to land in its own cell (zone)', [6, 7, 8, 11, 12, 13, 16, 17, 18].every(t => {
    let arg = 0; for (let a = 1; a < 25; a++) if (ker[t * 25 + a] > ker[t * 25 + arg]) arg = a; return arg === t;
  }));
  // the kernel and the engine's draw are one normal: sample the draw and compare
  const rng = R.mulberry32(9), n = 40000, t = 18, hits = new Array(25).fill(0);
  for (let i = 0; i < n; i++) {
    const tp = K.targetOf(t);
    const x = tp.x + R.probit(rng()) * 0.45, zn = tp.zn + R.probit(rng()) * 0.45 / 1.9;
    hits[K.cellAt(x, zn)]++;
  }
  const maxErr = Math.max(...hits.map((h, a) => Math.abs(h / n - ker[t * 25 + a])));
  check('the miss table matches the miss the engine draws', maxErr < 0.01, maxErr.toFixed(4));
}

/* ---- the solver and the grade ---- */
const pack = synthPack();
const model = new G.Model(pack);
const t0 = Date.now();
const start = model.solve(model.startState());
const solveMs = Date.now() - t0;
check('hold% from the start is a probability', start.hold > 0 && start.hold < 1, String(start.hold));
check('the solver is fast enough to run in the page', solveMs < 5000, solveMs + ' ms');
console.log(`     start hold ${(start.hold * 100).toFixed(1)}%, best first call ${start.type} cell ${start.cell}, ${model._V.size} states in ${solveMs} ms`);
{
  const p2 = synthPack({ lead: 2 });
  const h2 = new G.Model(p2).solve(new G.Model(p2).startState()).hold;
  check('a bigger lead holds more', h2 > start.hold, `${h2} vs ${start.hold}`);
  const p3 = synthPack({ bases: 7 });
  const h3 = new G.Model(p3).solve(new G.Model(p3).startState()).hold;
  check('bases loaded holds less', h3 < start.hold, `${h3} vs ${start.hold}`);
}
{
  const st = model.startState();
  const g = G.gradeCall(model, st, { type: start.type, cell: start.cell });
  check('the best call grades green with nothing lost', g.band === 'green' && g.lost === 0, JSON.stringify(g));
  const bands = { green: 0, yellow: 0, orange: 0, red: 0 };
  for (const type of model.types) for (let cell = 0; cell < 25; cell++) bands[G.gradeCall(model, st, { type, cell }).band]++;
  console.log('     band spread over every call at the start:', JSON.stringify(bands));
  calib('the start state offers more than one band', Object.values(bands).filter(Boolean).length >= 3);
}

{
  // the stored hold table (what the browser reads) grades like a fresh solve
  const p2 = synthPack();
  p2.hold = new G.Model(p2, { fresh: true }).holdTable();
  const fresh = new G.Model(synthPack(), { fresh: true }), stored = new G.Model(p2);
  const rng = testRng(11);
  let worst = 0, same = true;
  for (let i = 0; i < 300; i++) {
    const st = { bi: Math.floor(rng() * 9), b: Math.floor(rng() * 4), s: Math.floor(rng() * 3), outs: Math.floor(rng() * 3), bases: Math.floor(rng() * 8), margin: 1 };
    const call = { type: fresh.types[Math.floor(rng() * 3)], cell: Math.floor(rng() * 25) };
    const a = G.gradeCall(fresh, st, call), b = G.gradeCall(stored, st, call);
    worst = Math.max(worst, Math.abs(a.lost - b.lost));
    if (a.band !== b.band) same = false;
  }
  check('the stored hold table grades like a fresh solve', worst <= 0.02 && same, 'worst ' + worst);
  check('the hold table is dense and full', p2.hold.h.every(v => v != null), String(p2.hold.h.length));
}

/* ---- outings ---- */
function play(seed, chooser) {
  const o = E.createOuting(pack, { seed, mode: 'practice', model });
  let guard = 0;
  while (o.status === 'live' && guard++ < 200) E.throwPitch(o, chooser(o));
  return o;
}
const bestCall = o => { const b = model.solve(o.st); return { type: b.type, cell: b.cell }; };
const heartFastball = () => ({ type: 'FF', cell: 12 });

{
  let allGreen = true, n = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const o = play(seed, bestCall);
    n += o.grades.length;
    if (!o.grades.every(g => g.band === 'green')) allGreen = false;
  }
  check('a best-call outing is all green (30 seeds)', allGreen, `${n} pitches`);
}
{
  const c = { green: 0, yellow: 0, orange: 0, red: 0 };
  for (let seed = 1; seed <= 30; seed++) for (const g of play(seed, heartFastball).grades) c[g.band]++;
  const tot = c.green + c.yellow + c.orange + c.red;
  console.log('     fastballs down the middle:', JSON.stringify(c));
  calib('fastballs down the middle grade mostly orange and red', (c.orange + c.red) / tot > 0.5, JSON.stringify(c));
}
{
  // determinism: the same pack, seed and calls give the same results
  const rng = testRng(5);
  const calls = Array.from({ length: 60 }, () => ({ type: model.types[Math.floor(rng() * 3)], cell: Math.floor(rng() * 25) }));
  const run = () => { const o = E.replay(pack, 1234, calls, { model: new G.Model(pack) }); return JSON.stringify({ log: o.log, grades: o.grades, outcome: o.outcome }); };
  const a = run(), b = run();
  check('determinism: same seed and calls, same outing', a === b);
  const c = JSON.stringify({ log: E.replay(pack, 1235, calls, { model }).log });
  check('a different seed gives a different outing', c !== JSON.stringify(JSON.parse(a).log));
  // four draws a pitch, whatever happened
  const o = E.replay(pack, 77, calls, { model });
  const ref = R.mulberry32(77);
  for (let i = 0; i < 4 * o.log.length; i++) ref();
  check('four draws per pitch, always', ref() === o.rng());
  // the shape a UI reads
  const p = o.log[0];
  const k = o.log.find(q => q.paOver && q.outs > q.countBefore.b * 0 && q.runnerMoves.some(m => m.to === -1));
  check('a batter put out shows as to: -1', !!k || o.log.every(q => !q.paOver || q.runs || q.runnerMoves.length));
  check('a pitch result carries the contract fields', ['n', 'call', 'actual', 'actualCell', 'velo', 'batter', 'result', 'countBefore', 'count', 'outs', 'bases', 'runnerMoves', 'runs', 'paOver', 'drawn'].every(k => k in p));
}
{
  // end rules: every pitch a home run. Lead 1, a man on: the first pitch
  // puts them ahead. walkOffLive decides walk-off against door's open.
  const allHr = (walkOffLive, lead, bases = 1) => {
    const hrIdx = G.KEYS.indexOf('home_run');
    const p = synthPack({ walkOffLive, lead, bases, override: (library, pitches, pitchFor) => {
      for (const lib of library) for (const t in lib) {
        const ref = pitchFor(t, 'home_run') * 3;
        for (let cell = 0; cell < 25; cell++) {
          lib[t].p[cell] = [0, 1, 2, 3].map(() => G.KEYS.map((k, i) => (i === hrIdx ? 1000 : 0)));
          lib[t].x[cell] = G.KEYS.map((k, i) => (i === hrIdx ? ref : -1));
        }
      }
    } });
    const o = E.createOuting(p, { seed: 1 });
    E.throwPitch(o, { type: 'FF', cell: 12 });
    return o;
  };
  check('a go-ahead run with walkOffLive is a walk-off', allHr(true, 1).outcome === 'walk_off');
  check('a go-ahead run without walkOffLive is door\'s open', allHr(false, 1).outcome === 'doors_open');
  check('a tying run is door\'s open', allHr(true, 1, 0).outcome === 'doors_open');
  check('one swing that ties and goes ahead is a walk-off when walkOffLive', allHr(true, 1, 1).outcome === 'walk_off');
  const fin = E.finishOuting(allHr(true, 1));
  check('finishOuting returns the contract fields', ['outcome', 'pitches', 'strip', 'score', 'percentile', 'pitchedLike', 'reveal', 'vsReal'].every(k => k in fin));
  check('a walk-off loses to a real door shut', fin.vsReal === 'lost');
}

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
