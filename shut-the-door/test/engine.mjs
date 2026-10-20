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
  // end rules: a scripted pack. A four-seam is always a home run and a
  // slider always a swinging strike, wherever it lands, so the calls write
  // the inning: the four-seam scores the batter and every runner.
  const HR = G.KEYS.indexOf('home_run'), SW = G.KEYS.indexOf('swinging_strike');
  const scripted = (walkOffLive, lead, bases = 0) => synthPack({ walkOffLive, lead, bases, override: (library, pitches, pitchFor) => {
    for (const lib of library) for (const t in lib) {
      const hr = pitchFor(t, 'home_run') * 3, sw = pitchFor(t, 'swinging_strike') * 3;
      for (let cell = 0; cell < 25; cell++) {
        const k = t === 'FF' ? HR : SW, ref = t === 'FF' ? hr : sw;
        lib[t].p[cell] = [0, 1, 2, 3].map(() => G.KEYS.map((x, i) => (i === k ? 1000 : 0)));
        lib[t].x[cell] = G.KEYS.map((x, i) => (i === k ? ref : -1));
      }
    }
  } });
  const HOMER = { type: 'FF', cell: 12 }, STRIKE = { type: 'SL', cell: 12 };
  const run = (pack, calls) => {
    const o = E.createOuting(pack, { seed: 1 });
    for (const c of calls) { if (o.status !== 'live') break; E.throwPitch(o, c); }
    return o;
  };
  const strikes = n => Array.from({ length: n }, () => STRIKE);

  check('a go-ahead run with walkOffLive is a walk-off', run(scripted(true, 1, 1), [HOMER]).outcome === 'walk_off');
  check('a go-ahead run without walkOffLive is door\'s open', run(scripted(false, 1, 1), [HOMER]).outcome === 'doors_open');
  check('one swing that ties and goes ahead: the go-ahead rule decides', run(scripted(true, 1, 1), [HOMER]).outcome === 'walk_off'
    && run(scripted(false, 2, 3), [HOMER]).outcome === 'doors_open');

  // a tie does not end it
  const tieP = scripted(true, 1);
  const tied = run(tieP, [HOMER]);
  check('a run that ties keeps the outing live', tied.status === 'live' && tied.score.us === tied.score.them && tied.outcome === null,
    JSON.stringify({ status: tied.status, score: tied.score }));
  check('the inning goes on after a tie: the next batter, the same outs', tied.st.bi === 1 && tied.st.outs === 0 && tied.st.margin === 0);

  // three outs with it still tied: a held tie
  const held = run(tieP, [HOMER, ...strikes(9)]);
  check('a tie, then three outs: tie_held', held.status === 'over' && held.outcome === 'tie_held', held.outcome);
  const heldR = E.finishOuting(held);
  check('a held tie scores the tie_held bonus',
    heldR.score === Math.max(0, Math.round(E.SCORE_BASE - E.SCORE_PER_PT * held.grades.reduce((a, g) => a + g.lost, 0))) + E.RESULT_BONUS.tie_held,
    String(heldR.score));
  check('the held tie\'s runs are the runs that tied it', heldR.runs === 1);
  check('a held tie is HELD THE TIE', K.OUTCOME_LABEL[heldR.outcome] === 'HELD THE TIE');

  // a tie, then a go-ahead run
  check('a tie, then a go-ahead run with walkOffLive: walk-off', run(tieP, [HOMER, STRIKE, HOMER]).outcome === 'walk_off');
  const noWo = run(scripted(false, 1), [HOMER, STRIKE, HOMER]);
  check('a tie, then a go-ahead run without walkOffLive: door\'s open', noWo.outcome === 'doors_open' && noWo.score.them === noWo.score.us + 1);
  check('a lead of two, one run: still door shut on three outs', run(scripted(true, 2), [HOMER, ...strikes(9)]).outcome === 'door_shut');

  // the grade after a tie is on the tie's goal
  const m = new G.Model(tieP);
  const lead1 = m.startState(), tie0 = { ...m.startState(), bi: 1, margin: 0 };
  check('with the lead, a call that ties is worth 0 to the hold (a blown save)', m.callValue(lead1, 'FF', 12).hold === 0);
  check('tied, a call that goes ahead is worth 0 and a strike keeps it tied', m.callValue(tie0, 'FF', 12).hold === 0 && Math.abs(m.callValue(tie0, 'SL', 12).hold - 1) < 1e-9);
  check('the goal: 1 with the lead, 0 once it is tied', G.goalOf(lead1) === 1 && G.goalOf(tie0) === 0);
  const gTie = tied.grades.length === 1 && G.gradeCall(m, tied.st, HOMER);
  check('after a tie the grade says tied, and the homer is red', gTie.tied === true && gTie.band === 'red' && gTie.value === 0 && gTie.best === 100, JSON.stringify(gTie));
  check('before the tie it does not', tied.grades[0].tied === false);
  check('after a tie the reason speaks of the tie', /keeps it tied/.test(G.gradeCall(m, tied.st, STRIKE).reason), G.gradeCall(m, tied.st, STRIKE).reason);
  check('the stored hold table has a slot for a tied game', m.holdTable().h.length === m.N * 12 * 3 * 8 * (m.M + 1));

  // the rank and vsReal
  check('the outcomes rank door shut, held the tie, door\'s open, walk-off',
    K.OUTCOMES.join() === 'door_shut,tie_held,doors_open,walk_off'
    && K.OUTCOME_RANK.door_shut === 3 && K.OUTCOME_RANK.tie_held === 2 && K.OUTCOME_RANK.doors_open === 1 && K.OUTCOME_RANK.walk_off === 0);
  check('every outcome has a label and a result bonus, in rank order',
    K.OUTCOMES.every(k => K.OUTCOME_LABEL[k] && E.RESULT_BONUS[k] != null)
    && K.OUTCOMES.every((k, i) => i === 0 || E.RESULT_BONUS[k] < E.RESULT_BONUS[K.OUTCOMES[i - 1]]));
  const rv = (outcome, runs) => ({ outcome, runs });
  check('a held tie loses to a real door shut', E.vsReal('tie_held', 1, rv('door_shut', 0)) === 'lost');
  check('a held tie beats a real door\'s open and a real walk-off', E.vsReal('tie_held', 2, rv('doors_open', 1)) === 'beat' && E.vsReal('tie_held', 3, rv('walk_off', 2)) === 'beat');
  check('a walk-off loses to a real held tie', E.vsReal('walk_off', 2, rv('tie_held', 2)) === 'lost');
  check('two held ties: fewer runs wins, the same runs match', E.vsReal('tie_held', 2, rv('tie_held', 3)) === 'beat' && E.vsReal('tie_held', 3, rv('tie_held', 3)) === 'matched');

  const fin = E.finishOuting(run(scripted(true, 1, 1), [HOMER]));
  check('finishOuting returns the contract fields', ['outcome', 'pitches', 'strip', 'score', 'percentile', 'pitchedLike', 'reveal', 'vsReal'].every(k => k in fin));
  check('a walk-off loses to a real door shut', fin.vsReal === 'lost');
}

{ // vsReal: outcome, then runs, then pitches when his count is known
  const real = { outcome: 'door_shut', runs: 0, pitches: 14 };
  check('vsReal: same outcome and runs, 7 pitches to his 14 beats him', E.vsReal('door_shut', 0, real, 7) === 'beat');
  check('vsReal: same outcome and runs, more pitches loses to him', E.vsReal('door_shut', 0, real, 20) === 'lost');
  check('vsReal: equal pitches is matched', E.vsReal('door_shut', 0, real, 14) === 'matched');
  check('vsReal: his count unknown is matched', E.vsReal('door_shut', 0, Object.assign({}, real, { pitches: null }), 7) === 'matched');
  check('vsReal: runs come before pitches', E.vsReal('door_shut', 1, real, 3) === 'lost');
  check('vsReal: outcome comes before pitches', E.vsReal('doors_open', 0, real, 3) === 'lost');
}

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
