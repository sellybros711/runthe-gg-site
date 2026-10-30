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
import { readFileSync } from 'fs';
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
const bestCall = o => E.bestCall(o);   // rules 2: the grade's best call, with the history
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
    heldR.score === Math.round(E.SCORE_BASE * Math.exp(-held.grades.reduce((a, g) => a + g.lost, 0) / E.SCORE_DECAY)) + E.RESULT_BONUS.tie_held,
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

/* ---- the release (the owner's call, 2026-10-22): q scales the miss, nothing else ---- */
{
  check('release: q 1 is 0.6x, q 0.5 is 1.0x, q 0 is 1.5x, no q is 1.0x',
    K.spreadOf(1) === K.RELEASE.SPREAD_BEST && K.spreadOf(K.RELEASE.Q_AVG) === 1 && K.spreadOf(0) === K.RELEASE.SPREAD_WORST
    && K.spreadOf(undefined) === 1 && K.spreadOf(null) === 1 && K.RELEASE.SPREAD_BEST === 0.6 && K.RELEASE.SPREAD_WORST === 1.5);
  let mono = true;
  for (let i = 1; i <= 100; i++) if (!(K.spreadOf(i / 100) < K.spreadOf((i - 1) / 100))) mono = false;
  check('release: a better release always means a tighter miss', mono);
  const bad = [1.01, -0.01, NaN, Infinity, '0.5', {}];
  check('release: a q that is not a number 0..1 is refused', bad.every(q => { try { E.replay(pack, 1, [{ type: 'FF', cell: 12, q }], { model }); return false; } catch (e) { return true; } }));

  const rng = testRng(21);
  const base = Array.from({ length: 60 }, () => ({ type: model.types[Math.floor(rng() * 3)], cell: Math.floor(rng() * 25) }));
  const withQ = q => base.map(c => Object.assign({}, c, { q }));
  const plain = E.replay(pack, 4321, base, { model });
  const avg = E.replay(pack, 4321, withQ(0.5), { model });
  const strip = o => JSON.stringify(o.log.map(p => Object.assign({}, p, { call: { type: p.call.type, cell: p.call.cell } })));
  check('release: a missing q plays exactly as q 0.5 (1.0x): the same outing', strip(plain) === strip(avg) && plain.outcome === avg.outcome);
  check('release: a call without q is kept without q, and plays at 1.0x', plain.calls.every(c => !('q' in c)) && plain.log.every(p => p.spread === 1 && !('q' in p.call)));
  check('release: a timed call keeps its q', avg.calls.every(c => c.q === 0.5) && avg.log.every(p => p.call.q === 0.5));

  /* the same draws, scaled: the miss of q 1 is 0.6 of the miss of 1.0x, pitch by pitch,
     for as long as the two outings throw the same calls (they do: the calls are a list) */
  const tight = E.replay(pack, 4321, withQ(1), { model }), wide = E.replay(pack, 4321, withQ(0), { model });
  const n = Math.min(plain.log.length, tight.log.length, wide.log.length);
  let worst = 0, cmp = 0;
  for (let i = 0; i < n; i++) {
    const t = K.targetOf(base[i].cell), a = plain.log[i].actual;
    for (const [o, f] of [[tight, 0.6], [wide, 1.5]]) {
      const b = o.log[i].actual;
      worst = Math.max(worst, Math.abs((b.x - t.x) - f * (a.x - t.x)), Math.abs((b.zn - t.zn) - f * (a.zn - t.zn)));
      cmp++;
    }
  }
  check(`release: q scales the same draws (q 1 is 0.6x, q 0 is 1.5x of each miss, ${cmp} misses)`, n > 0 && worst < 0.0021, 'worst ' + worst);

  /* the spread over many pitches: q 1 lands in the called cell more often, q 0 less */
  const hitRate = q => { let hit = 0, n2 = 0; for (let seed = 1; seed <= 400; seed++) { const o = E.createOuting(pack, { seed, model }); const pr = E.throwPitch(o, { type: 'FF', cell: 12, q }).pitchResult; n2++; if (pr.actualCell === 12) hit++; } return hit / n2; };
  const h1 = hitRate(1), h5 = hitRate(0.5), h0 = hitRate(0);
  check(`release: a perfect release paints the cell more often (${(h1 * 100).toFixed(0)}% / ${(h5 * 100).toFixed(0)}% / ${(h0 * 100).toFixed(0)}%)`, h1 > h5 && h5 > h0);

  /* the grade never sees q: the same state graded the same whatever the release */
  const g = q => { const o = E.createOuting(pack, { seed: 99, model }); return JSON.stringify(E.throwPitch(o, { type: 'SL', cell: 19, q }).pitchGrade); };
  check('release: the grade is the call, whatever the release', g(undefined) === g(0) && g(0) === g(1) && g(1) === g(0.37));

  /* determinism with q: the same seed, calls and releases give the same outing */
  const qr = testRng(31);
  const mixed = base.map((c, i) => (i % 3 === 0 ? c : Object.assign({}, c, { q: Math.round(qr() * 100) / 100 })));
  const run = () => { const o = E.replay(pack, 777, mixed, { model: new G.Model(pack) }); return JSON.stringify({ log: o.log, grades: o.grades, outcome: o.outcome, calls: o.calls }); };
  check('release: determinism with q (mixed timed and untimed calls)', run() === run());
  const again = E.replay(pack, 777, JSON.parse(JSON.stringify(E.replay(pack, 777, mixed, { model }).calls)), { model });
  check('release: the kept calls, through JSON, replay the outing exactly', JSON.stringify(again.log) === JSON.stringify(E.replay(pack, 777, mixed, { model }).log));
  check('release: q is kept to two places', E.replay(pack, 5, [{ type: 'FF', cell: 12, q: 0.123456 }], { model }).calls[0].q === 0.12);
}

/* ---- rules 2 (2026-10-22): the hitter adjusts, the arm tires, a repeat keeps less release ---- */
{
  const rng = testRng(41);
  const calls = Array.from({ length: 60 }, () => ({ type: model.types[Math.floor(rng() * 3)], cell: Math.floor(rng() * 25) }));
  const o2 = E.replay(pack, 2468, calls, { model, rules: 2 });
  check(`rules 2: a new outing plays rules ${G.RULES} (rules 2, the third out, the call and ABS) and its kept calls carry r ${G.RULES}; a rules 2 outing's carry r 2`,
    E.createOuting(pack, { seed: 1, model }).rules === G.RULES && G.RULES >= G.THIRD_OUT_RULES
    && E.replay(pack, 2468, calls, { model }).rules === 1
    && E.createOuting(pack, { seed: 1, model, rules: G.RULES }).rules === G.RULES && o2.calls.every(c => c.r === 2));
  check('rules 2: calls without r replay as rules 1, calls with r 2 as rules 2', E.replay(pack, 2468, calls, { model }).rules === 1 && E.replay(pack, 2468, o2.calls, { model }).rules === 2);
  const again = E.replay(pack, 2468, JSON.parse(JSON.stringify(o2.calls)), { model: new G.Model(pack) });
  check('rules 2: determinism, the kept calls through JSON replay the outing exactly', JSON.stringify({ l: again.log, g: again.grades }) === JSON.stringify({ l: o2.log, g: o2.grades }));
  check('rules 2: a rules 2 call in a rules 1 outing is refused', (() => { try { E.replay(pack, 1, [{ type: 'FF', cell: 12, r: 2 }], { model, rules: 1 }); return false; } catch (e) { return true; } })());
  const o1 = E.replay(pack, 2468, calls, { model });
  check('rules 1: no arm on a pitch result, no history in the grade (the shape stored rows were made with)', o1.log.every(p => !('arm' in p)) && o1.calls.every(c => !('r' in c)));
  check('rules 2: the same four draws a pitch (the stream never depends on the rules)', (() => {
    const a = E.createOuting(pack, { seed: 77, model, rules: 1 }), b = E.createOuting(pack, { seed: 77, model, rules: 2 });
    E.throwPitch(a, { type: 'FF', cell: 12 }); E.throwPitch(b, { type: 'FF', cell: 12 });
    return a.rng() === b.rng();
  })());

  // the hitter adjusts: the same pitch to the same spot, again and again, loses whiffs and gives up hits
  const ctx0 = G.contextOf([], model.startState(), 2);
  const seen = { ...ctx0, pa: [{ type: 'SL', cell: 22 }, { type: 'SL', cell: 22 }], before: {} };
  const a0 = G.adjustOf(ctx0, 'SL', 22), a2 = G.adjustOf(seen, 'SL', 22);
  const KI = Object.fromEntries(G.KEYS.map((k, i) => [k, i]));
  check('rules 2: a pitch he has seen twice there is missed less and hit more than a first look',
    a2[KI.swinging_strike] < a0[KI.swinging_strike] && a2[KI.single] > a0[KI.single] && a2[KI.home_run] > a0[KI.home_run]);
  const st0 = model.startState();
  const fresh = model.callValue(st0, 'SL', 22, G.contextOf([], st0, 2));
  const twice = model.callValue(st0, 'SL', 22, seen);
  check('rules 2: and the grade prices it: the repeat is worth less', twice.hold < fresh.hold, `${(fresh.hold * 100).toFixed(2)} to ${(twice.hold * 100).toFixed(2)}`);
  const other = model.callValue(st0, 'FF', 6, seen);
  check('rules 2: a different pitch elsewhere is not marked down by it', Math.abs(other.hold - model.callValue(st0, 'FF', 6, G.contextOf([], st0, 2)).hold) < 0.05);
  // where he has aimed: pounding the zone makes a zone pitch easier to hit and a chase pitch easier to chase
  const pound = { ...ctx0, zone: 12, seen: 12 }, nibble = { ...ctx0, zone: 0, seen: 12 };
  check('rules 2: after twelve aims in the zone, a zone pitch gives up more hits and a chase pitch draws more whiffs',
    G.adjustOf(pound, 'FF', 12)[KI.single] > G.adjustOf(nibble, 'FF', 12)[KI.single] && G.adjustOf(pound, 'FF', 22)[KI.swinging_strike] > G.adjustOf(nibble, 'FF', 22)[KI.swinging_strike]);

  // the arm: centred on real relievers' pitch counts, wider late and with runners on
  check('rules 2: the arm is tighter early, wider late, a little wider with runners on',
    G.fatigueOf(1, 0) < 1 && G.fatigueOf(30, 0) > G.fatigueOf(15, 0) && G.fatigueOf(5, 1) > G.fatigueOf(5, 0), [1, 15, 30].map(n => G.fatigueOf(n, 0)).join(' '));
  const late = E.createOuting(pack, { seed: 3, model });
  for (let i = 0; i < 40 && late.status === 'live'; i++) E.throwPitch(late, { type: model.types[i % 3], cell: (i * 7) % 25 });
  check('rules 2: each pitch result carries the arm it was thrown with', late.log.every((p, i) => p.arm === G.fatigueOf(i + 1, late.before[i].bases)));

  // a repeat keeps less of a good release; a bad one and the meter off are unchanged
  check('release: on a repeat a perfect release helps less (0.6x, 0.8x, 0.9x)', K.spreadOf(1, 0) === 0.6 && Math.abs(K.spreadOf(1, 1) - 0.8) < 1e-12 && Math.abs(K.spreadOf(1, 2) - 0.9) < 1e-12);
  check('release: a bad release and no release are the same on a repeat', K.spreadOf(0, 3) === 1.5 && K.spreadOf(null, 3) === 1 && K.spreadOf(0.5, 2) === 1);
  const rep = E.createOuting(pack, { seed: 8, model });
  const sp = [];
  for (let i = 0; i < 3 && rep.status === 'live'; i++) sp.push(E.throwPitch(rep, { type: 'FF', cell: 12, q: 1 }).pitchResult.spread);
  check('release: three perfect fastballs in a row play 0.6x, 0.8x, 0.9x', sp.length < 3 || (sp[0] === 0.6 && sp[1] === 0.8 && sp[2] === 0.9), sp.join(' '));

  // the scouting view: coarser than the profile, never read by the engine
  const pr = pack.scenario.batters[0].profile;
  const v = G.scoutView(pr);
  const quadCells = [0, 1, 5];   // up and to the catcher's left: one quadrant, one value
  check('scout: the chase area reads in Statcast\'s four quadrants', quadCells.every(c => v.heat[c] === v.heat[0]));
  check('scout: values come in steps (damage .050, swing 10 points, rates 5 points)',
    v.heat.every(x => Math.abs(x / 0.05 - Math.round(x / 0.05)) < 1e-6) && v.swing.every(x => Math.abs(x / 0.1 - Math.round(x / 0.1)) < 1e-6) &&
    Math.abs(v.chase / 0.05 - Math.round(v.chase / 0.05)) < 1e-6);
  check('scout: the profile itself is untouched', JSON.stringify(pr) === JSON.stringify(pack.scenario.batters[0].profile) && v !== pr);
}

/* ---- the meter's numbers (meter.js): an average tap is about his own command ---- */
{
  const MT = require('../meter.js');
  check('meter: a tap on the mark is q 1, a tap a full window off is q 0', MT.qOf(0, 50) === 1 && MT.qOf(MT.windowMs(50), 50) === 0 && MT.qOf(-MT.windowMs(50) * 2, 50) === 0);
  check('meter: the window grows with command (control pitchers are easier to time)', MT.windowMs(35) < MT.windowMs(50) && MT.windowMs(50) < MT.windowMs(72));
  check('meter: early is negative, late is positive', MT.errAt(MT.MARK * MT.SWEEP_MS - 30) < 0 && MT.errAt(MT.MARK * MT.SWEEP_MS + 30) > 0
    && MT.errAt(MT.SWEEP_MS * (2 - MT.MARK) - 30) < 0 && MT.errAt(MT.SWEEP_MS * (2 - MT.MARK) + 30) > 0);
  const mr = R.mulberry32(17);
  const meanSpread = cmd => { let s = 0; const n = 40000; for (let i = 0; i < n; i++) { let e = R.probit(mr()) * MT.TIMING.sdMs; if (mr() < MT.TIMING.slip) e = mr() * MT.TIMING.slipMaxMs; s += K.spreadOf(MT.qOf(e, cmd)); } return s / n; };
  const m50 = meanSpread(50), m35 = meanSpread(35), m72 = meanSpread(72);
  console.log(`     meter, an ordinary tap (sd ${MT.TIMING.sdMs} ms, ${MT.TIMING.slip * 100}% slips): mean spread ${m35.toFixed(3)}x at command 35, ${m50.toFixed(3)}x at 50, ${m72.toFixed(3)}x at 72`);
  check('meter: an ordinary tap averages his own command at command 50 (within 3%)', Math.abs(m50 - 1) < 0.03, m50.toFixed(3));
  check('meter: across the packs\' commands (35-72) an ordinary tap stays within 10% of 1.0x', Math.abs(m35 - 1) < 0.1 && Math.abs(m72 - 1) < 0.1, `${m35.toFixed(3)} ${m72.toFixed(3)}`);
  check('meter: the word is execution only (no band name)', [0, 0.1, 0.3, 0.6, 0.8, 0.95].every(q => !/green|yellow|orange|red|grade/.test(MT.wordOf(q, -1) + MT.wordOf(q, 1))));
}

/* ---- rules 3 (2026-10-24): a run that crosses before a legal third out counts ---- */
{
  const { rowBreaks } = await import('../check-rules.mjs');
  // a two-out single, runner on second: he scores, then the batter is thrown out at second
  const p3 = synthPack({ lead: 1, outs: 2, bases: 2 });
  p3.advance.single[18] = [[1, 0, 1, 1, 'single', [[2, 4], [0, -1]]]];
  const m3 = new G.Model(p3), m2 = new G.Model(p3, { thirdOutRuns: false });
  const st = { bi: 0, b: 0, s: 0, outs: 2, bases: 2, margin: 1 };
  const [, t3] = m3.transitions(st, 'ip:single')[0], [, t2] = m2.transitions(st, 'ip:single')[0];
  check('rules 3: the run that crossed before the batter was tagged at second counts, and the half ends tied',
    t3.end === 'hold' && t3.runs === 1 && t3.margin === 0 && m3.after(st, t3) === 0);
  check('rules 3: under rules 2 the same third out scores none and holds, as stored outings were played',
    t2.end === 'hold' && t2.runs === 0 && m2.after(st, t2) === 1);
  check('rules 3: an outing played under rules 2 takes the old third out whatever model it is given',
    m3.transitions(st, 'ip:single', false)[0][1].runs === 0 && m2.transitions(st, 'ip:single', true)[0][1].runs === 1);
  check('rules 3: the hold table prices it (the single is worth less to the pitcher when the run counts)',
    m3.solve(st).hold < m2.solve(st).hold, `${m3.solve(st).hold} vs ${m2.solve(st).hold}`);
  // the audit: the 3D agent's two rows, and the real plays that replaced them
  const kinds = (cat, o, b, row) => rowBreaks(cat, o, b, row).map(x => x[0]);
  check('check-rules: a triple with the batter out at the plate and the runner from first kept on first is a pass',
    kinds('triple', 2, 1, [0.006, 1, 0, 1, 'triple', [[0, -1]]]).includes('pass'));
  check('check-rules: a double with the batter out and the runner kept on first is a pass',
    kinds('double', 2, 1, [0.059, 1, 0, 1, 'double', [[0, -1]]]).includes('pass'));
  check('check-rules: the real plays pass (runner out at third, batter on second; runner scores, batter out at third, the run counted)',
    !kinds('double', 2, 1, [0.045, 2, 0, 1, 'double', [[1, -1], [0, 2]]]).length && !kinds('triple', 2, 1, [0.006, 0, 1, 1, 'triple', [[1, 4], [0, -1]]]).length);
  check('check-rules: a run on a third out made by the batter before first is refused, and a force out scores none',
    kinds('out_ground', 2, 4, [0.1, 4, 1, 1, 'out', [[3, 4], [0, -1]]]).includes('third')
    && kinds('out_ground', 2, 5, [0.1, 4, 1, 1, 'fielders_choice', [[3, 4], [1, -1], [0, 1]]]).includes('third'));
  check('check-rules: a runner shown scoring on a third out with no run counted is refused, and one left on is no run',
    kinds('single', 2, 2, [0.03, 0, 0, 1, 'single', [[2, 4], [0, -1]]]).includes('third') && !kinds('out_fly', 2, 2, [0.5, 2, 0, 1, 'out', [[0, -1]]]).length);
  check('check-rules: more outs than three, two men on one base, and a runner going back are refused',
    kinds('out_line', 2, 3, [0.1, 0, 0, 2, 'double_play', [[1, -1], [0, -1]]]).includes('outs')
    && kinds('single', 0, 1, [0.1, 1, 0, 0, 'single', [[0, 1]]]).includes('pass')
    && kinds('out_fly', 0, 2, [0.1, 1, 0, 1, 'out', [[2, 1], [0, -1]]]).includes('back'));
  const synthBreaks = [];
  for (const cat of G.IN_PLAY) for (let o = 0; o < 3; o++) for (let b = 0; b < 8; b++) for (const row of pack.advance[cat][o * 8 + b]) synthBreaks.push(...rowBreaks(cat, o, b, row));
  check('check-rules: the synthetic table is legal too', !synthBreaks.length, JSON.stringify(synthBreaks.slice(0, 3)));
}

/* ---- effort (2026-10-22, CONTRACT.md 5c): the meter's first stop ---- */
{
  const MT = require('../meter.js');
  const KI = Object.fromEntries(G.KEYS.map((k, i) => [k, i]));
  const refused = (calls, opts) => { try { E.replay(pack, 1, calls, Object.assign({ model }, opts)); return false; } catch (e) { return true; } };
  check('effort: an e that is not a number 0..1 is refused', [-0.1, 1.2, '1', NaN, {}].every(e => refused([{ type: 'FF', cell: 12, q: 0.5, e }], { rules: 2 })));
  check('effort: an e needs a timed release, and is a rules 2 call', refused([{ type: 'FF', cell: 12, e: 1 }], { rules: 2 }) && refused([{ type: 'FF', cell: 12, q: 0.5, e: 1 }], { rules: 1 }));
  check('effort: e is kept to two places, beside q and r', (c => c.e === 0.12 && c.q === 0.5 && c.r === 2)(E.replay(pack, 5, [{ type: 'FF', cell: 12, q: 0.5, e: 0.123456 }], { model, rules: 2 }).calls[0]));

  const rng = testRng(57);
  const base = Array.from({ length: 50 }, () => ({ type: model.types[Math.floor(rng() * 3)], cell: Math.floor(rng() * 25), q: Math.round(rng() * 100) / 100 }));
  const withE = e => base.map(c => Object.assign({}, c, { e }));
  const plain = E.replay(pack, 4242, base, { model, rules: 2 }), mid = E.replay(pack, 4242, withE(0.5), { model, rules: 2 });
  const shape = o => JSON.stringify({ l: o.log.map(p => [p.actual, p.actualCell, p.result, p.runs, p.arm, p.spread]), g: o.grades, out: o.outcome });
  check('effort: e 0.5 plays exactly as no e (the same pitches, arm, grades and outcome)', shape(plain) === shape(mid));
  check('effort: a call without e is kept without e and shows no stuff', plain.calls.every(c => !('e' in c)) && plain.log.every(p => !('stuff' in p)));
  check('effort: a call with e shows the speed it was thrown at', mid.log.every(p => p.stuff && p.velo === p.stuff.velo));
  check('reveal: an effort call\'s PitchResult.velo is veloOf(his arsenal pitch, e), the speed the UI reveals after the throw', mid.log.every(p => {
    const ap = pack.scenario.pitcher.arsenal.find(x => x.type === p.call.type);
    return p.velo === require('../meter.js').veloOf(ap, p.call.e);
  }));
  check('effort: the same four draws a pitch whatever e; up to ordinary the same miss, harder a wider one', (() => {
    const a = E.createOuting(pack, { seed: 91, model }), b = E.createOuting(pack, { seed: 91, model }), c = E.createOuting(pack, { seed: 91, model });
    const pa = E.throwPitch(a, { type: 'FF', cell: 12, q: 0.7, e: 0 }).pitchResult, pb = E.throwPitch(b, { type: 'FF', cell: 12, q: 0.7, e: 0.5 }).pitchResult;
    const pc = E.throwPitch(c, { type: 'FF', cell: 12, q: 0.7, e: 1 }).pitchResult;
    const t = K.targetOf(12), k = G.effortSpread('FF', 1);
    const ra = a.rng(), rb = b.rng(), rc = c.rng();
    return ra === rb && rb === rc && JSON.stringify(pa.actual) === JSON.stringify(pb.actual)
      && k > 1 && pc.stuff.spread === k && Math.abs((pc.actual.x - t.x) - k * (pb.actual.x - t.x)) < 0.002;
  })());
  check('effort: the grade never reads this pitch\'s e', (() => {
    const g = e => { const o = E.createOuting(pack, { seed: 99, model }); return JSON.stringify(E.throwPitch(o, { type: 'SL', cell: 19, q: 0.6, e }).pitchGrade); };
    return g(0) === g(0.5) && g(1) === g(0.5);
  })());
  const again = E.replay(pack, 4242, JSON.parse(JSON.stringify(E.replay(pack, 4242, withE(1), { model, rules: 2 }).calls)), { model: new G.Model(pack) });
  check('effort: determinism, the kept calls through JSON replay the outing exactly', shape(again) === shape(E.replay(pack, 4242, withE(1), { model, rules: 2 })));

  // the pitch: all 1 at e 0.5; a harder fastball misses more bats and gives up fewer hits (measured)
  check('effort: the row is untouched at e 0.5 and without e', G.effortMult('FF', 0.5).every(x => x === 1) && G.effortMult('FF', null).every(x => x === 1));
  const m0 = G.effortMult('FF', 0), m1 = G.effortMult('FF', 1);
  check('effort: a max effort fastball whiffs more and is hit less than a soft one (EFFORT.BINS, measured)',
    m1[KI.swinging_strike] > 1 && m0[KI.swinging_strike] < 1 && m1[KI.single] < m0[KI.single] && m1[KI.home_run] < m0[KI.home_run], `${m0[KI.swinging_strike]} ${m1[KI.swinging_strike]}`);
  let mono = true;
  for (let i = 1; i <= 100; i++) if (G.effortMult('FF', i / 100)[KI.swinging_strike] < G.effortMult('FF', (i - 1) / 100)[KI.swinging_strike] - 1e-12) mono = false;
  check('effort: a fastball\'s whiffs rise with e', mono);

  // the arm: e 1 counts one and a half pitches, e 0 half of one, for every pitch after it
  check('effort: the arm load is under 1 below e 0.5, 1 at 0.5 and without e, over 1 above',
    G.loadOf(0) === 1 - G.EFFORT.LOAD_DOWN && G.loadOf(0.5) === 1 && G.loadOf(1) === 1 + G.EFFORT.LOAD_UP && G.loadOf(null) === 1);
  const hard = E.replay(pack, 4242, withE(1), { model, rules: 2 }), soft = E.replay(pack, 4242, withE(0), { model, rules: 2 });
  const n = Math.min(hard.log.length, soft.log.length, plain.log.length);
  check('effort: max effort tires the arm faster, an easy pitch slower', n < 14 || (hard.ctxs[13].arm === 1 + 13 * G.loadOf(1) && soft.ctxs[13].arm === 1 + 13 * G.loadOf(0) && plain.ctxs[13].arm === 14), n >= 14 ? `${hard.ctxs[13].arm} ${soft.ctxs[13].arm}` : 'short');
  check('effort: max effort builds strain, which widens the arm; easy pitches pay it back; none without e',
    n < 14 || (hard.ctxs[13].strain === 13 * G.EFFORT.LOAD_UP && hard.ctxs[13].fatigue > plain.ctxs[13].fatigue && soft.ctxs[13].strain === 0 && plain.ctxs.every(c => c.strain === 0)));
  {
    const log = [1, 1, 0, 0, 0, 0].map(e => ({ call: { type: 'FF', cell: 12, e }, actualCell: 12, paOver: false }));
    const c = G.contextOf(log, model.startState(), 2);
    check('effort: two max pitches then four easy ones leave no strain', c.strain === 0, String(c.strain));
  }

  // the window: a game rule on the meter
  check('effort: the window is SOFT at e 0, 1 at e 0.5 and without e, HARD at e 1', MT.windowScale(0) === MT.EFFORT_WINDOW.SOFT && MT.windowScale(0.5) === 1 && MT.windowScale(null) === 1 && MT.windowScale(1) === MT.EFFORT_WINDOW.HARD);
  check('effort: the bright band shrinks as e rises', MT.bandsFor(50, 1).best < MT.bandsFor(50, 0.5).best && MT.bandsFor(50, 0.5).best < MT.bandsFor(50, 0).best && MT.bandsFor(50).best === MT.bandsFor(50, 0.5).best);
  const mr = R.mulberry32(23);
  const meanSpread = e => { let s = 0; const N = 40000; for (let i = 0; i < N; i++) { let x = R.probit(mr()) * MT.TIMING.sdMs; if (mr() < MT.TIMING.slip) x = mr() * MT.TIMING.slipMaxMs; s += K.spreadOf(MT.qOf(x, 50, e)); } return s / N; };
  const s0 = meanSpread(0), s5 = meanSpread(0.5), s1 = meanSpread(1);
  console.log(`     effort, an ordinary tap at command 50: mean spread ${s0.toFixed(3)}x at e 0, ${s5.toFixed(3)}x at 0.5, ${s1.toFixed(3)}x at 1`);
  check('effort: an ordinary tap misses wider at max effort and tighter at an easy one', s1 > s5 && s5 > s0);
  check('effort: the effort needle runs 0 to 1 and back', MT.effortAt(0) === 0 && MT.effortAt(MT.EFFORT_SWEEP_MS) === 1 && MT.effortAt(MT.EFFORT_SWEEP_MS * 1.5) === 0.5);

  // the speed shown: his own pitches, slowest fifth to fastest
  const a = { type: 'FF', velo: 95, pfxX: -7, pfxZ: 16, stuff: { src: 'his', n: 500, velo: [93.4, 94.5, 95.1, 95.7, 96.6], pfxX: [-6.8, -7, -7, -7.1, -7.3], pfxZ: [15.5, 15.9, 16, 16.2, 16.5] } };
  check('effort: the speed at e 0, 0.5 and 1 is his slowest, middle and fastest fifth', MT.veloFor(a, 0) === 93.4 && MT.veloFor(a, 0.5) === 95.1 && MT.veloFor(a, 1) === 96.6 && MT.veloFor(a, 0.75) === 95.7);
  check('effort: without e, or without stuff, the speed is his average', MT.veloFor(a, null) === 95 && MT.veloFor({ type: 'FF', velo: 95, pfxX: 0, pfxZ: 0 }, 1) === 95);
}

/* ---- the names the two bar meter feature-detects ---- */
{
  const MT = require('../meter.js');
  const a = { type: 'FF', velo: 95, pfxX: -7, pfxZ: 16, stuff: { src: 'his', n: 500, velo: [93.4, 94.5, 95.1, 95.7, 96.6], pfxX: [-7, -7, -7, -7, -7], pfxZ: [16, 16, 16, 16, 16] } };
  check('meter: EFFORT is true, and the neutral effort is 0.5', MT.EFFORT === true && K.EFFORT.MID === 0.5);
  check('meter: POWER is the player\'s name for EFFORT (the same flag)', MT.POWER === true && MT.POWER === MT.EFFORT);
  {
    /* the bright band (BEST_Q 0.85) on the ordinary tap model, seeded: about one tap in five lands in it */
    const rb = R.mulberry32(29), N = 60000; let hit = 0;
    for (let i = 0; i < N; i++) { let x = R.probit(rb()) * MT.TIMING.sdMs; if (rb() < MT.TIMING.slip) x = rb() * MT.TIMING.slipMaxMs; if (MT.qOf(x, 50) >= MT.BEST_Q) hit++; }
    const rate = hit / N;
    console.log(`     bright band, an ordinary tap at command 50: ${(rate * 100).toFixed(1)}% (the owner's ask: most miss it, a good timer still gets it)`);
    check('meter: the bright band is q 0.85 and up, and an ordinary tap lands in it about one time in five', MT.BEST_Q === 0.85 && rate > 0.15 && rate < 0.28, rate.toFixed(3));
  }
  const w = e => MT.windowOf(e), width = e => w(e)[1] - w(e)[0];
  check('meter: windowOf(e) is the bright band [lo, hi] on the bar, around the mark, narrower with effort',
    w(0.5)[0] < MT.MARK && w(0.5)[1] > MT.MARK && width(1) < width(0.5) && width(0.5) < width(0) && Math.abs(width(0.5) - 2 * MT.bandsFor(50).best) < 1e-12);
  check('meter: veloOf(pitch, e) is the speed the engine reports', MT.veloOf(a, 1) === 96.6 && MT.veloOf(a, 0) === 93.4 && MT.veloOf(a, null) === 95);
}

/* ---- the free aim point (2026-10-22, CONTRACT.md 5d) ---- */
{
  check('aim: at is clamped to the cell and kept to two places', JSON.stringify(K.aimAt([0.123, -0.9])) === '[0.12,-0.5]' && K.aimAt(null) === null && JSON.stringify(K.aimAt([-0.001, 0])) === '[0,0]');
  check('aim: an at that is not [u, v] numbers is refused', [[1], 'x', [0, 'a'], [NaN, 0], {}].every(at => { try { E.replay(pack, 1, [{ type: 'FF', cell: 12, at }], { model, rules: 2 }); return false; } catch (e) { return true; } }));
  check('aim: an aim point is a rules 2 call', (() => { try { E.replay(pack, 1, [{ type: 'FF', cell: 12, at: [0.2, 0] }], { model, rules: 1 }); return false; } catch (e) { return true; } })());
  const p = K.aimPoint(12, [0.5, 0.5]), t = K.targetOf(12);
  check('aim: u moves toward the catcher\'s right (+x), v up (+zn), by half a cell at 0.5', Math.abs(p.x - t.x - K.GRID.COL_FT / 2) < 1e-12 && Math.abs(p.zn - t.zn - K.GRID.ROW_ZN / 2) < 1e-12);
  const rng = testRng(71);
  const base = Array.from({ length: 40 }, () => ({ type: model.types[Math.floor(rng() * 3)], cell: Math.floor(rng() * 25), q: 0.6 }));
  const shape = o => JSON.stringify({ l: o.log.map(x => [x.actual, x.actualCell, x.result]), g: o.grades });
  const none = E.replay(pack, 515, base, { model, rules: 2 }), zero = E.replay(pack, 515, base.map(c => Object.assign({}, c, { at: [0, 0] })), { model, rules: 2 });
  check('aim: [0, 0] plays exactly as no at (the cell\'s centre)', shape(none) === shape(zero) && none.calls.every(c => !('at' in c)));
  const o1 = E.createOuting(pack, { seed: 9, model }), o2 = E.createOuting(pack, { seed: 9, model });
  const r1 = E.throwPitch(o1, { type: 'FF', cell: 12, q: 0.5 }), r2 = E.throwPitch(o2, { type: 'FF', cell: 12, q: 0.5, at: [0.4, -0.3] });
  check('aim: the same draws, moved by the offset',
    Math.abs(r2.pitchResult.actual.x - r1.pitchResult.actual.x - 0.4 * K.GRID.COL_FT) < 0.002 && Math.abs(r2.pitchResult.actual.zn - r1.pitchResult.actual.zn + 0.3 * K.GRID.ROW_ZN) < 0.002
    && o1.rng() === o2.rng());
  // the grade prices the exact spot (the owner, 2026-10-23); the best call and the mean stay the cells' centres
  check('aim: the grade prices the exact spot, against the same best call', r1.pitchGrade.best === r2.pitchGrade.best
    && JSON.stringify(r1.pitchGrade.bestCall) === JSON.stringify(r2.pitchGrade.bestCall) && r1.pitchGrade.value !== r2.pitchGrade.value);
  {
    const st = model.startState(), ctx = G.contextOf([], st, 2);
    const near = (cell, at) => model.callValue(st, 'SL', cell, ctx, at).hold;
    // an aim at the corner of a chase cell nearest the zone prices between that chase cell and the zone cell beside it
    const chase = 23, zone = 18, toward = [0, 0.5];   // cell 23 is below 18; v up is toward the zone
    const v0 = near(chase), v1 = near(chase, toward), vz = near(zone);
    check('aim: a chase cell aimed at its zone edge is priced between the chase cell and the zone cell', Math.min(v0, vz) - 1e-9 <= v1 && v1 <= Math.max(v0, vz) + 1e-9 && v1 !== v0, `${v0} ${v1} ${vz}`);
    check('aim: [0, 0] prices exactly as the cell', near(chase, [0, 0]) === v0);
  }
  const again = E.replay(pack, 515, JSON.parse(JSON.stringify(E.replay(pack, 515, base.map(c => Object.assign({}, c, { at: [0.3, 0.3] })), { model, rules: 2 }).calls)), { model: new G.Model(pack) });
  check('aim: determinism, the kept calls through JSON replay the outing exactly', shape(again) === shape(E.replay(pack, 515, base.map(c => Object.assign({}, c, { at: [0.3, 0.3] })), { model, rules: 2 })));
}

/* ---- rules 4 (2026-10-24): the call by location, ABS challenges, the bright band ---- */
{
  const rng = testRng(71);
  const calls = Array.from({ length: 400 }, () => ({ type: model.types[Math.floor(rng() * model.types.length)], cell: Math.floor(rng() * 25), q: Math.round(rng() * 100) / 100 }));
  let heartTakes = 0, heartBalls = 0, farTakes = 0, farStrikes = 0, perfect = 0, perfectOff = 0, perfectOut = 0, bat = 0, batOver = 0, deep = 0, deepBalls = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const o = E.createOuting(pack, { seed, model });
    for (const c of calls) {
      if (o.status !== 'live') break;
      const p = E.throwPitch(o, c).pitchResult;
      if (p.abs) {
        if (p.abs.d >= 7.75) { heartTakes++; if (p.abs.called === 'ball') heartBalls++; }
        if (p.abs.d >= 4) { deep++; if (p.abs.called === 'ball') deepBalls++; }
        if (p.abs.d <= -6) { farTakes++; if (p.abs.called === 'called_strike') farStrikes++; }
      }
      if (p.challenge && p.challenge.by === 'batter') { bat++; if (p.challenge.overturned) batOver++; }
      if (p.perfect) {
        perfect++;
        const t = K.aimPoint(c.cell, c.at);
        const off = Math.hypot((p.actual.x - t.x) * 12, (p.actual.zn - t.zn) * pack.kernelZoneFt * 12);
        if (off > K.PERFECT.CAP_IN + 0.01) perfectOff++;
        if (K.inZone(c.cell) && !K.inZone(p.actualCell)) perfectOut++;
      }
    }
  }
  check(`rules 4: a take deep in the zone (8 inches in) is never called a ball (${heartBalls} of ${heartTakes})`, heartTakes > 10 && heartBalls === 0);
  check(`rules 4: a take 4 inches in is a ball under 2% of the time, the 2024 umpires' 1% (${deepBalls} of ${deep})`, deep > 50 && deepBalls / deep < 0.02);
  check(`rules 4: a take 6 inches out is called a strike under 1% (${farStrikes} of ${farTakes})`, farTakes > 50 && farStrikes / farTakes < 0.01);
  check(`rules 4: a bright band release lands within ${K.PERFECT.CAP_IN} inches of the aim (${perfect} releases, ${perfectOff} past it) and never leaves the zone when aimed in it (${perfectOut})`, perfect > 50 && perfectOff === 0 && perfectOut === 0);
  check(`rules 4: batters challenge called strikes and win some (${bat} challenges, ${batOver} overturned)`, bat > 0 && batOver > 0 && batOver < bat);
  // determinism, and a pitcher's challenge rides on the call it challenged
  let found = null;
  for (let seed = 1; seed <= 200 && !found; seed++) {
    const o = E.createOuting(pack, { seed, model });
    for (const c of calls) {
      if (o.status !== 'live') break;
      const r = E.throwPitch(o, c);
      if (r.state.abs.challengeLive && r.pitchResult.abs.strike) {
        const before = r.state.count;
        const cr = E.challengePitch(o);
        found = { o, seed, before, after: cr.state.count, pr: cr.pitchResult, left: cr.state.abs.left.pitcher };
        while (o.status === 'live') E.throwPitch(o, calls[o.log.length % calls.length]);
        break;
      }
    }
  }
  check('rules 4: a challenged ball inside the ABS zone is overturned to a called strike, the count moves, and the challenge is kept',
    !!found && found.pr.result === 'called_strike' && found.pr.challenge.overturned && found.left === K.ABS.PER_SIDE
    && found.o.calls.some(c => c.ch === 1) && found.after.b + found.after.s <= found.before.b + found.before.s + 1);
  if (found) {
    const re = E.replay(pack, found.seed, JSON.parse(JSON.stringify(found.o.calls)), { model: new G.Model(pack) });
    check('rules 4: the kept calls, ch and all, through JSON replay the outing exactly', JSON.stringify({ l: re.log, g: re.grades, s: re.score }) === JSON.stringify({ l: found.o.log, g: found.o.grades, s: found.o.score }));
    const noCh = found.o.calls.map(c => { const x = Object.assign({}, c); delete x.ch; return x; });
    check('rules 4: the same calls with the challenge taken out are a different outing', JSON.stringify(E.replay(pack, found.seed, noCh, { model }).log) !== JSON.stringify(found.o.log));
  }
  check('rules 4: a challenge is refused with none to make', (() => { const o = E.createOuting(pack, { seed: 3, model }); try { E.challengePitch(o); return false; } catch (e) { return true; } })());
  check('rules 4: ch on a rules 3 call is refused', (() => { try { E.replay(pack, 1, [{ type: model.types[0], cell: 12, r: 3, ch: 1 }], { model }); return false; } catch (e) { return true; } })());
  // the four draws a pitch: the outing's stream is where it would be without the challenges
  const o1 = E.replay(pack, 99, calls.slice(0, 8), { model, rules: 4 });
  check('rules 4: four draws a pitch on the outing stream, the batter\'s gamble on its own', (() => { const r = R.mulberry32(99); for (let i = 0; i < 4 * o1.log.length; i++) r(); return r() === o1.rng(); })());
  check('rules 3: an outing has no ABS', E.createOuting(pack, { seed: 1, model, rules: 3 }).abs === null && E.publicState(E.createOuting(pack, { seed: 1, model, rules: 3 })).abs === null);
  check('contract: the bright band starts where the meter\'s does', K.PERFECT.BEST_Q === require('../meter.js').BEST_Q);
}

/* rules 5: the routine play (contract.js ROUTINE) */
{
  const r = K.routineOf;
  check('rules 5: a medium grounder at the shortstop is routine', r('ground', 85, -5, -19) === 'ground');
  check('rules 5: a grounder in the hole, a hard one and a slow roller are not', r('ground', 85, -5, -29) === null && r('ground', 101, -5, -19) === null && r('ground', 40, -20, -19) === null);
  check('rules 5: a lazy fly and every popup are routine, a liner and a deep drive are not',
    r('fly', 88, 38, 10) === 'air' && r('popup', 99, 70, 0) === 'air' && r('line', 80, 15, 0) === null && r('fly', 99, 30, 10) === null && r('fly', 88, 22, 10) === null);
  check('rules 5: an untracked ball is judged by its type and spray', r('ground', null, null, 18) === 'ground' && r('ground', null, null, 0) === null && r('fly', null, null, 30) === 'air');
  check('rules 5: a routine error still happens, rarely', K.ROUTINE.KEEP.ground > 0 && K.ROUTINE.KEEP.ground < 0.1 && K.ROUTINE.KEEP.air > 0 && K.ROUTINE.KEEP.air < 0.5);
  check('rules 5: a rules 5 outing plays, a rules 4 one replays as rules 4', E.createOuting(pack, { seed: 1, model, rules: G.ROUTINE_RULES }).rules === 5
    && E.replay(pack, 1, [{ type: model.types[0], cell: 12, r: 4 }], { model }).rules === 4);
}

/* rules 6: the runners read the ball (contract.js THE RUNNERS READ THE BALL) */
{
  const RN = JSON.parse(readFileSync(new URL('../data/runners.json', import.meta.url), 'utf8'));
  const rn = { dist: { coef: RN.dist.coef }, edges: RN.edges, ratio: RN.ratio };
  const c = (ev, la) => K.carryOf(ev, la, RN.dist.coef);
  check('rules 6: the carry fit reads Statcast distance (100 mph at 28 degrees near 380 ft, a 76 mph popup near 130)',
    Math.abs(c(100, 28) - 380) < 20 && Math.abs(c(76, 65) - 135) < 25 && c(93, 16) < c(100, 20) && c(null, 20) === null);
  let bad = 0;
  for (const [key, bb, ev, la, sp, cl] of RN.check) if (K.runnerClass(key, bb, ev, la, sp, rn) !== cl) bad++;
  check(`rules 6: runnerClass is runners.py's class on all ${RN.check.length} sampled real balls`, bad === 0);
  check('rules 6: a runner out is X, else the lead runner\'s bases', K.runnerCategory(4, [[3, -1], [0, -1]]) === 'X' && K.runnerCategory(4, [[3, 4], [0, -1]]) === '1'
    && K.runnerCategory(4, [[0, -1]]) === '0' && K.runnerCategory(1, [[1, 4], [0, 2]]) === '3' && K.runnerCategory(0, [[0, 1]]) === null);
  const r = (cl) => RN.ratio[`out_fly|3|0|${cl}`];
  check('rules 6: on a fly with a runner on third, a shallow one holds him and a deep one scores him (2024)',
    r('bC') && r('fC') && r('bC')[1] > 1 && r('bC')[2] < 1 && r('fC')[2] >= 1 && r('fC')[1] < 0.2);
  check('rules 6: the infield liner doubles the runner off more, the deep liner less', RN.ratio['out_line|1|0|aC'][0] > 1 && RN.ratio['out_line|1|0|gC'][0] < 1);
  check('rules 6: a rules 6 outing plays, a rules 5 one replays as rules 5', E.createOuting(pack, { seed: 1, model, rules: G.RUNNER_RULES }).rules === 6
    && E.replay(pack, 1, [{ type: model.types[0], cell: 12, r: 5 }], { model }).rules === 5);
}

/* rules 7: the running game (contract.js THE RUNNING GAME) on a real pack */
{
  const MT = require('../meter.js');
  const real = JSON.parse(readFileSync(new URL('../data/packs/std-2016-ws7-chapman.json', import.meta.url), 'utf8'));
  const rm = new G.Model(real);
  check('rules 7: the normal cdf from arithmetic matches the inverse to 1e-4', [-2, -0.5, 0, 0.8, 1.7].every(z => Math.abs(K.normInv(K.normCdf(z)) - z) < 1e-4));
  check('rules 7: a rules 7 outing plays, a rules 6 one replays as rules 6, with no steal', G.STEAL_RULES === 7 && E.createOuting(real, { seed: 1, model: rm, rules: 7 }).rules === 7 && !!E.createOuting(real, { seed: 1, model: rm, rules: 7 }).run
    && E.replay(real, 1, [{ type: rm.types[0], cell: 12, r: 6 }], { model: rm }).run === null);
  const o0 = E.createOuting(real, { seed: 3, model: rm });
  check('rules 7: the spot starts with its real runner on first (Jose Ramirez, 2016 WS 7)', o0.run.on[1] === '608070' && o0.st.bases === 1);
  check('rules 7: no pickoff before the first pitch', !E.pickoffLive(o0));
  check('rules 7: a pickoff never raises the steal attempt (the data\'s 1.8x after a throw is the pitcher reading the runner, not caused by the throw)',
    Object.keys(real.steal.attMult).every(k => !k.startsWith('po|')) && Object.entries(real.steal.sucZ).filter(([k]) => k.startsWith('po|2|1')).every(([, z]) => z <= 0));
  let bad = '';
  try { E.throwPitch(E.createOuting(real, { seed: 3, model: rm }), { type: rm.types[0], cell: 12, q: 0.5, e: 1, ss: 1 }); bad = 'max power on a quick delivery was taken'; } catch (e) { /* refused */ }
  try { E.throwPitch(E.createOuting(real, { seed: 3, model: rm, rules: 6 }), { type: rm.types[0], cell: 12, ss: 1 }); bad = 'a quick delivery under rules 6 was taken'; } catch (e) { /* refused */ }
  check('rules 7: a quick delivery has no max power, and is a rules 7 call', bad === '' && MT.QUICK.E_MAX < 1 && MT.windowMs(50, null, true) < MT.windowMs(50, null, false));
  // the four draws never move: the same calls throw the same pitches with steals on or off
  const calls = [];
  for (let i = 0; i < 12; i++) calls.push({ type: rm.types[i % rm.types.length], cell: [6, 12, 18, 2, 22][i % 5], q: 0.5 });
  const a = E.createOuting(real, { seed: 77, model: rm }), b = E.createOuting(real, { seed: 77, model: rm, rules: 6 });
  let sameFirst = true;
  for (const c of calls) {
    if (a.status !== 'live' || b.status !== 'live') break;
    const pa = E.throwPitch(a, c).pitchResult, pb = E.throwPitch(b, c).pitchResult;
    if (pa.actual.x !== pb.actual.x || pa.actual.zn !== pb.actual.zn) sameFirst = false;
    if (JSON.stringify(a.st) !== JSON.stringify(b.st)) break;   // a steal moved the state: past here the rows can differ
  }
  check('rules 7: the steal stream never moves the four draws (same miss as rules 6 until a steal changes the state)', sameFirst);
  // pickoffs: a third throw that does not get him is a balk
  let balked = false, ended = 0;
  for (let sd = 1; sd < 400 && !balked; sd++) {
    const o = E.createOuting(real, { seed: sd, model: rm });
    E.throwPitch(o, { type: rm.types[0], cell: 0, q: 0.5 });
    for (let k = 0; k < 3 && E.pickoffLive(o); k++) {
      const ev = E.pickoff(o).pickoff;
      if (ev.balk) { balked = k === 2 && o.st.bases === 2 && o.calls[0].pa === 3; }
      if (ev.out) { ended++; break; }
    }
  }
  check('rules 7: past two disengagements a failed pickoff is a balk, and the runner moves up', balked);
  // steals happen, at about the real rate and success
  let att = 0, safe = 0;
  for (let sd = 1; sd <= 600; sd++) {
    const o = E.createOuting(real, { seed: sd, model: rm });
    while (o.status === 'live') {
      const pr = E.throwPitch(o, { type: rm.types[sd % rm.types.length], cell: 0, q: 0.5 }).pitchResult;
      if (pr.steal && (pr.steal.result === 'safe' || pr.steal.result === 'out')) { att++; if (pr.steal.result === 'safe') safe++; if (typeof pr.steal.margin !== 'number') att = -1e9; }
    }
  }
  check(`rules 7: Ramirez runs and is mostly safe, with a margin (${att} attempts, ${safe} safe in 600 outings of chase pitches)`, att > 5 && safe / att > 0.5 && safe / att < 0.98);
}

/* rules 8: the closer's outing to the end of the game (grade.js THE HALVES, engine.js 11) */
{
  const HR = G.KEYS.indexOf('home_run'), SW = G.KEYS.indexOf('swinging_strike');
  // the scripted pack (a four-seam is a home run, a slider a swinging strike), made two halves: he
  // comes in for the bottom 8th, his team bats the top 9th (runs R), then the bottom 9th. In the 9th
  // a defensive substitute bats in the third slot (a new batter, index 9).
  const twoHalves = (lead, R, outs = 0) => {
    const pack = synthPack({ walkOffLive: false, lead, outs, override: (library, pitches, pitchFor) => {
      for (const lib of library) for (const t in lib) {
        const hr = pitchFor(t, 'home_run') * 3, sw = pitchFor(t, 'swinging_strike') * 3;
        for (let cell = 0; cell < 25; cell++) {
          const k = t === 'FF' ? HR : SW, ref = t === 'FF' ? hr : sw;
          lib[t].p[cell] = [0, 1, 2, 3].map(() => G.KEYS.map((x, i) => (i === k ? 1000 : 0)));
          lib[t].x[cell] = G.KEYS.map((x, i) => (i === k ? ref : -1));
        }
      }
    } });
    const sc = pack.scenario;
    sc.situation.inning = 8;
    sc.batters.push(Object.assign({}, sc.batters[2], { id: 'synth-sub', name: 'Synth Sub' }));
    pack.library.push(pack.library[2]);
    sc.halves = [
      { inning: 8, half: 'bottom', outs, bases: 0, walkOffLive: false, lineup: [0, 1, 2, 3, 4, 5, 6, 7, 8], real: true },
      { inning: 9, half: 'bottom', outs: 0, bases: 0, walkOffLive: true, lineup: [0, 1, 9, 3, 4, 5, 6, 7, 8], real: true },
    ];
    const pas = [{ batter: { id: 1, name: 'A' }, short: 'K', runs: 0, outs: 1, bases: 0, runners: [null, null, null], hit: false, err: 0 },
      { batter: { id: 2, name: 'B' }, short: R ? 'HR' : '1B', runs: R ? 1 : 0, outs: 1, bases: R ? 0 : 1, runners: [R ? null : 2, null, null], hit: true, err: 0 },
      { batter: { id: 3, name: 'C' }, short: '6-3', runs: 0, outs: 2, bases: R ? 0 : 2, runners: [null, R ? null : 2, null], hit: false, err: 0 },
      { batter: { id: 4, name: 'D' }, short: 'F8', runs: Math.max(0, R - 1), outs: 3, bases: R ? 0 : 2, runners: [null, R ? null : 2, null], hit: false, err: 0 }];
    sc.between = [{ inning: 9, half: 'top', team: 'Synth', abbr: 'SYN', runs: R, pas }];
    sc.line = { teams: ['SYN', 'OPP'], innings: [[1, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [lead - 1 + 3, 3 - 0]].map((x, i) => (i < 7 ? [i === 0 ? 3 + lead : 0, i === 0 ? 3 : 0] : [0, 0])), H: [5, 4], E: [0, 0] };
    return pack;
  };
  const HOMER = { type: 'FF', cell: 12 }, STRIKE = { type: 'SL', cell: 12 };
  const strikes = n => Array.from({ length: n }, () => STRIKE);
  const run = (pack, calls, rules) => {
    const o = E.createOuting(pack, { seed: 1, rules });
    for (const c of calls) { if (o.status !== 'live') break; E.throwPitch(o, c); }
    return o;
  };

  const p0 = twoHalves(1, 0), m0 = new G.Model(p0);
  check('rules 8: a pack with two halves is two halves, the margins to the lead plus his team\'s runs', m0.H === 2 && m0.M === 1 && new G.Model(twoHalves(1, 2)).M === 3);
  const t3 = m0.transitions({ h: 0, bi: 4, b: 0, s: 2, outs: 2, bases: 0, margin: 1 }, 'strike')[0][1];
  check('rules 8: three outs in the 8th go on to the 9th: 0-0, no outs, nobody on, the next batter, the margin plus his runs',
    !t3.end && t3.half && t3.st.h === 1 && t3.st.bi === 5 && t3.st.outs === 0 && t3.st.bases === 0 && t3.st.b === 0 && t3.st.margin === 1, JSON.stringify(t3));
  check('rules 8: in the 9th the third slot is the substitute', m0.who({ h: 1, bi: 2 }) === 9 && m0.who({ h: 0, bi: 2 }) === 2);
  const one = synthPack({ walkOffLive: true, lead: 1 }), m1 = new G.Model(one);
  const two = synthPack({ walkOffLive: false, lead: 1 });
  two.scenario.halves = [{ inning: 8, half: 'bottom', outs: 0, bases: 0, walkOffLive: false, lineup: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    { inning: 9, half: 'bottom', outs: 0, bases: 0, walkOffLive: true, lineup: [0, 1, 2, 3, 4, 5, 6, 7, 8] }];
  two.scenario.between = [{ inning: 9, half: 'top', runs: 0, pas: [] }];
  const m2 = new G.Model(two), v2 = m2.solve(m2.startState()).hold, v1 = m1.solve(m1.startState()).hold;
  check('rules 8: holding the 8th and the 9th is worth less than holding one inning', v2 < v1 - 0.05, `${v2} vs ${v1}`);
  // the goal: a tie in the 8th is worth 0 for the lead when his team scores no more, and more than 0 when it does
  const pR = twoHalves(1, 1), mR = new G.Model(pR);
  const tieFrom = (m) => m.after({ h: 0, bi: 0, b: 0, s: 0, outs: 0, bases: 1, margin: 1 }, { st: { h: 0, bi: 1, b: 0, s: 0, outs: 0, bases: 0, margin: 0 }, runs: 1 });
  check('rules 8: a tie in the 8th is a blown lead (0) with no runs of his to come', tieFrom(m0) === 0);
  check('rules 8: and worth the chance of a lead again when his team scores in the 9th', tieFrom(mR) > 0.2 && tieFrom(mR) < 1, String(tieFrom(mR)));
  const tbl = mR.holdTable();
  check('rules 8: the table runs over both halves, with the other goal where one is asked',
    tbl.halves === 2 && tbl.h.length === 2 * mR.N * 288 * (mR.M + 1) && !!tbl.alt && tbl.alt.h.filter(x => x != null).length > 0 && !m0.holdTable().alt);
  pR.hold = tbl;
  const mT = new G.Model(pR);
  const probe = [mR.startState(), { h: 1, bi: 3, b: 1, s: 2, outs: 1, bases: 3, margin: 1 }, { h: 0, bi: 2, b: 0, s: 1, outs: 2, bases: 4, margin: 0 }];
  check('rules 8: the stored table reads back what the solve gave, for each goal', probe.every(st => Math.abs(mT.solve(st).hold - mR.solve(st).hold) < 1e-6
    && Math.abs(mT.solve(st, 1 - G.goalOf(st)).hold - mR.solve(st, 1 - G.goalOf(st)).hold) < 1e-6));

  // the engine
  const o = run(p0, strikes(9));
  const last = o.log[o.log.length - 1];
  check('rules 8: three outs in the 8th end the half, not the outing', o.status === 'live' && last.halfOver && last.outs === 3);
  const ho = last.halfOver;
  check('rules 8: the card: the 8th done, his team\'s real half, the 9th\'s leadoff', ho.done.inning === 8 && ho.between.inning === 9 && ho.between.half === 'top'
    && ho.between.pas.length === 4 && ho.next.inning === 9 && ho.next.leadoff.index === 3 && ho.next.score.us === 4 && ho.next.score.them === 3, JSON.stringify(ho.next));
  const st1 = E.publicState(o);
  check('rules 8: the state is the 9th: no outs, 0-0, the walk-off live, the half done kept', st1.half.index === 1 && st1.half.inning === 9 && st1.half.walkOffLive
    && st1.outs === 0 && st1.count.b === 0 && st1.halves.length === 1 && st1.batterIndex === 3);
  check('rules 8: the line score: the 8th on the board, his team\'s 9th, the hits', ho.line.innings[7][1] === 0 && ho.line.innings[8][0] === 0 && ho.line.H[0] === 6);
  const full = run(p0, strikes(18));
  check('rules 8: three outs in the 9th with the lead: door shut, 18 pitches', full.status === 'over' && full.outcome === 'door_shut' && full.log.length === 18);
  check('rules 8: the shut it button only in the last half', !E.publicState(run(p0, strikes(8))).shutItLive && E.publicState(run(p0, strikes(17))).shutItLive);
  check('rules 8: a go-ahead run in the 8th ends it: door\'s open (the walk-off is the 9th\'s)', run(twoHalves(1, 0, 0), [HOMER, HOMER]).outcome === 'doors_open');
  check('rules 8: a go-ahead run in the 9th is a walk-off', run(p0, [...strikes(9), HOMER, HOMER]).outcome === 'walk_off');
  const tie8 = run(p0, [HOMER, ...strikes(9)]);
  check('rules 8: tied after the 8th, no runs of his: the 9th starts tied and the tie plays on', tie8.status === 'live' && tie8.st.h === 1 && tie8.st.margin === 0
    && run(p0, [HOMER, ...strikes(18)]).outcome === 'tie_held');
  const back = run(twoHalves(1, 1), [HOMER, ...strikes(9)]);
  check('rules 8: tied after the 8th, his team scores in the 9th: he pitches the 9th with the lead', back.st.h === 1 && back.st.margin === 1 && back.score.us === 5
    && run(twoHalves(1, 1), [HOMER, ...strikes(18)]).outcome === 'door_shut');
  const rr = E.finishOuting(run(twoHalves(1, 2), [HOMER, ...strikes(18)]));
  check('rules 8: the runs he allowed are his halves\' (his team\'s runs are not his)', rr.runs === 1 && rr.outcome === 'door_shut');
  // rules 7 on the same pack: the first half alone
  const r7 = run(p0, strikes(9), 7);
  check('rules 8: a rules 7 outing on a pack with halves is the first half alone', r7.status === 'over' && r7.outcome === 'door_shut' && r7.model.H === 1 && !r7.halves.length);
  // determinism: the same seed and calls give the same outing, card and all
  const a1 = run(p0, strikes(18)), a2 = run(p0, strikes(18));
  check('rules 8: deterministic, the half switch included', JSON.stringify(a1.log) === JSON.stringify(a2.log) && JSON.stringify(a1.halves) === JSON.stringify(a2.halves));
  check('rules 8: a new outing\'s calls carry r 8', a1.calls.every(c => c.r === 8) && G.RULES === 8 && G.FULL_RULES === 8);
  // the grade of the 9th's first pitch is the 9th's own state
  // the score (rules 8): a curve with the line's slope at 0, no floor, per out asked; the line before
  {
    const L = 50, mk = (rules, H, outs) => ({ rules, grades: [{ lost: L }], outcome: 'door_shut', model: { H }, pack: { scenario: { situation: { outs } } } });
    check('rules 8: the score is a curve that never reaches 0 (50 points lost: 168 + 300, not 0 + 300)', E.outingScore(mk(8, 1, 0)) === Math.round(700 * Math.exp(-50 / 35)) + 300 && E.outingScore(mk(8, 1, 0)) > 300);
    check('rules 8: four outs asked score their points at three quarters', E.outingScore(mk(8, 2, 2)) === Math.round(700 * Math.exp(-50 * 0.75 / 35)) + 300);
    check('rules 8: an outing before rules 8 keeps the line, floor and all', E.outingScore(mk(7, 1, 0)) === 300 && E.outingScore({ grades: [{ lost: 10 }], outcome: 'door_shut' }) === 800);
    check('rules 8: the slope at 0 is the line\'s (one point lost: 680 either way)', E.outingScore(Object.assign(mk(8, 1, 0), { grades: [{ lost: 1 }] })) === 980 && E.outingScore(Object.assign(mk(7, 1, 0), { grades: [{ lost: 1 }] })) === 980);
  }
  check('rules 8: the 9th is graded from its own state (the hold table over both halves)', a1.grades[9].best > 0 && a1.before[9].h === 1 && a1.before[9].outs === 0);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
