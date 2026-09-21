/* The comparison engine: correlation, joint draws, and the answer.
 *
 *   node fantasy/check-compare.mjs
 *
 * Pure functions, no network, no database.
 *
 *
 * THE ONE PROPERTY EVERYTHING ELSE DEPENDS ON
 * ---------------------------------------------------------------------------
 * Correlation must change the PROBABILITY and leave the MARGINALS alone.
 *
 * That is the whole claim of a copula and it is the thing that would be wrong
 * if it were wired up backwards, and it would be wrong invisibly: a projection
 * built with a mangled marginal still has a median, still ranks players, still
 * renders. Only the number the product sells would be off.
 *
 * So the checks pin both halves. Each player's own distribution is asserted
 * unchanged across three different correlation settings, and the probability
 * is asserted to move between them. Neither claim alone would catch a copula
 * applied to the wrong axis.
 */
import {
  normCdf, normInv, cholesky, safeCholesky,
  correlatedNormals, correlatedUniforms, corr, invGammaCdf, invDiscreteCdf,
} from './lib/copula.mjs';
import {
  fitPlayerMarkets, projectPlayer, buildIndex, buildCorrelation,
  simulateTogether, compare, rank, seedFor, PLACEHOLDER_CORR, MARKET_STAT,
} from './lib/project.mjs';
import { rng, normalSampler, gammaCdf, negBinPmf, summarize } from './lib/dist.mjs';

let fails = 0, ran = 0;
const ck = (label, cond, detail) => {
  ran++;
  console.log((cond ? ' ok   ' : ' FAIL ') + label + (cond || !detail ? '' : `\n         ${detail}`));
  if (!cond) fails++;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const section = (s) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);

console.log('\nThe comparison engine');

/* ===================================================================
 * 1. NORMAL CDF AND ITS INVERSE
 * ================================================================ */
section('Normal, and its inverse');

ck('normCdf(0) = 0.5', near(normCdf(0), 0.5, 1e-7));
ck('normCdf(1.96) is about 0.975', near(normCdf(1.96), 0.975, 1e-3), String(normCdf(1.96)));
ck('normCdf(-1.96) is about 0.025', near(normCdf(-1.96), 0.025, 1e-3));
ck('normInv(0.5) = 0', near(normInv(0.5), 0, 1e-10));
ck('normInv(0.975) is about 1.96', near(normInv(0.975), 1.959964, 1e-5), String(normInv(0.975)));
ck('normInv(0.025) is about -1.96', near(normInv(0.025), -1.959964, 1e-5));

/* Swept, because an inverse that is right in the middle and wrong in the tail
 * would distort exactly the part of a projection that matters. */
{
  let worst = 0, at = 0;
  for (let p = 0.0005; p < 0.9995; p += 0.0005) {
    const e = Math.abs(normCdf(normInv(p)) - p);
    if (e > worst) { worst = e; at = p; }
  }
  ck('the two round trip across the whole range', worst < 2e-7,
    `worst ${worst.toExponential(2)} at p=${at.toFixed(4)}`);
}
ck('normInv refuses 0 and 1 rather than returning infinity',
  threw(() => normInv(0)) !== null && threw(() => normInv(1)) !== null);

/* ===================================================================
 * 2. CHOLESKY
 * ================================================================ */
section('Cholesky');

{
  const A = [[1, 0.6, 0.3], [0.6, 1, 0.5], [0.3, 0.5, 1]];
  const L = cholesky(A);
  /* L L' must reproduce A. Checked elementwise rather than by eye. */
  let worst = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += L[i][k] * L[j][k];
      worst = Math.max(worst, Math.abs(s - A[i][j]));
    }
  }
  ck('L times L transpose reproduces the matrix', worst < 1e-12, String(worst));
  ck('and L is lower triangular', L[0][1] === 0 && L[0][2] === 0 && L[1][2] === 0);
}

ck('the identity decomposes to itself',
  cholesky([[1, 0], [0, 1]]).flat().join(',') === '1,0,0,1');

/* AN IMPOSSIBLE SET OF PAIRWISE CORRELATIONS. Each number is reasonable, the
 * set is not: A and B at 0.9, B and C at 0.9, A and C at -0.9 cannot all hold.
 * Nobody notices writing them down, and the estimation the cold path will do
 * can produce one too. */
{
  const bad = [[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]];
  ck('an impossible matrix is refused rather than returning NaN',
    threw(() => cholesky(bad)) !== null);

  const { L, shrink } = safeCholesky(bad);
  ck('safeCholesky repairs it', L.length === 3 && L.every((r) => r.every(Number.isFinite)));
  ck('and REPORTS how much repair it took', shrink > 0, String(shrink));
  console.log(`         that matrix needed ${(shrink * 100).toFixed(0)} percent shrinkage`);
}

{
  const fine = [[1, 0.3], [0.3, 1]];
  ck('a valid matrix is not touched', safeCholesky(fine).shrink === 0);
}

ck('a matrix with a broken diagonal cannot be rescued and says so',
  threw(() => safeCholesky([[0, 0.5], [0.5, 0]])) !== null);

ck('a non square matrix is refused',
  threw(() => cholesky([[1, 0.5, 0.2], [0.5, 1]])) !== null);

/* ===================================================================
 * 3. THE COPULA ACTUALLY CORRELATES
 * ================================================================ */
section('The copula carries the correlation it was given');

/* Drawn and MEASURED. The whole mechanism is one matrix multiply and a CDF,
 * and either could be wired up the wrong way round while still producing
 * plausible numbers. */
{
  for (const target of [-0.5, 0, 0.3, 0.75, 0.95]) {
    const L = cholesky([[1, target], [target, 1]]);
    const normal = normalSampler(rng(4242));
    const xs = [], ys = [];
    for (let i = 0; i < 40000; i++) {
      const z = correlatedNormals(L, normal);
      xs.push(z[0]); ys.push(z[1]);
    }
    const got = corr(xs, ys);
    ck(`normals asked for ${target} come out at ${got.toFixed(3)}`,
      Math.abs(got - target) < 0.012);
  }
}

/* Uniforms are the step before a marginal. Spearman rank correlation survives
 * the CDF squash almost exactly; Pearson drops slightly, which is a known
 * property of the transform rather than a bug, so the assertion is on the
 * direction and rough size. */
{
  const L = cholesky([[1, 0.8], [0.8, 1]]);
  const normal = normalSampler(rng(77));
  const us = [], vs = [];
  for (let i = 0; i < 40000; i++) {
    const u = correlatedUniforms(L, normal);
    us.push(u[0]); vs.push(u[1]);
  }
  const got = corr(us, vs);
  ck('uniforms keep most of the correlation through the squash',
    got > 0.75 && got < 0.82, got.toFixed(3));
  ck('and they really are uniform', (() => {
    const m = us.reduce((a, x) => a + x, 0) / us.length;
    const v = us.reduce((a, x) => a + (x - 0.5) ** 2, 0) / us.length;
    return near(m, 0.5, 0.01) && near(v, 1 / 12, 0.005);
  })());
  ck('and never land exactly on 0 or 1, which would hang an inverse CDF',
    us.every((u) => u > 0 && u < 1));
}

/* ===================================================================
 * 4. INVERSE CDFs
 * ================================================================ */
section('Inverse CDFs');

{
  let worst = 0;
  for (const [shape, scale] of [[1, 10], [2, 30], [0.5, 8], [9, 7]]) {
    for (const p of [0.01, 0.1, 0.5, 0.9, 0.99]) {
      const x = invGammaCdf(p, shape, scale, gammaCdf);
      worst = Math.max(worst, Math.abs(gammaCdf(x, shape, scale) - p));
    }
  }
  ck('the gamma inverse round trips', worst < 1e-9, String(worst));
}

ck('the discrete inverse walks the mass function', (() => {
  const pmf = (k) => negBinPmf(k, 5, 6);
  /* p just under the mass at 0 must give 0, just over must give 1. */
  const p0 = pmf(0);
  return invDiscreteCdf(p0 * 0.5, pmf) === 0 && invDiscreteCdf(p0 + pmf(1) * 0.5, pmf) === 1;
})());

ck('it is monotone', (() => {
  const pmf = (k) => negBinPmf(k, 5, 6);
  let prev = -1;
  for (let p = 0.01; p < 0.99; p += 0.01) {
    const v = invDiscreteCdf(p, pmf);
    if (v < prev) return false;
    prev = v;
  }
  return true;
})());

/* ===================================================================
 * 5. FITTING A PLAYER FROM REAL MARKET SHAPES
 * ================================================================ */
section('A player from his markets');

const chase = {
  playerId: 'p-chase', name: "Ja'Marr Chase", position: 'WR', team: 'CIN', eventId: 'e1',
  markets: [
    { market: 'player_reception_yds', line: 61.5, overPrice: -115, underPrice: -105 },
    { market: 'player_reception_yds', line: 62.5, overPrice: -118, underPrice: -104 },
    { market: 'player_receptions', line: 4.5, overPrice: -130, underPrice: 105 },
    { market: 'player_anytime_td', line: null, overPrice: 190, underPrice: -240 },
  ],
};
const nabers = {
  playerId: 'p-nabers', name: 'Malik Nabers', position: 'WR', team: 'NYG', eventId: 'e2',
  markets: [
    { market: 'player_reception_yds', line: 68.5, overPrice: -110, underPrice: -110 },
    { market: 'player_receptions', line: 5.5, overPrice: -115, underPrice: -105 },
    { market: 'player_anytime_td', line: null, overPrice: 260, underPrice: -340 },
  ],
};

{
  const p = projectPlayer(chase);
  ck('a player with markets gets a projection', p !== null);
  ck('and one fit per stat, not per quote',
    Object.keys(p.fits).sort().join(',') === 'anyTd,rec,recYd',
    Object.keys(p.fits).join(','));
  ck('two books on one market are consensused into one',
    p.consensus.player_reception_yds.books === 2);
  ck('and the disagreement between them is kept, not averaged away',
    p.consensus.player_reception_yds.spread > 0,
    String(p.consensus.player_reception_yds.spread));
  ck('marketCount counts fits, which is what the database CHECK wants',
    p.marketCount === 3);
}

/* THE NO-PROPS ANSWER IS null. Structural, not a convention. */
ck('a player with no markets gets NO projection, not a zero',
  projectPlayer({ playerId: 'x', name: 'Deep Bench', markets: [] }) === null);
ck('a player whose only market is one we do not score also gets none',
  projectPlayer({ playerId: 'x', name: 'Kicker', markets: [
    { market: 'player_field_goals', line: 1.5, overPrice: -110, underPrice: -110 },
  ] }) === null);
ck('a player whose every price is malformed gets none',
  projectPlayer({ playerId: 'x', name: 'Broken', markets: [
    { market: 'player_reception_yds', line: 50.5, overPrice: 0, underPrice: 0 },
  ] }) === null);

/* ===================================================================
 * 6. THE CORRELATION MATRIX FOR A SET OF PLAYERS
 * ================================================================ */
section('Building the matrix');

{
  const ps = [projectPlayer(chase), projectPlayer(nabers)];
  const idx = buildIndex(ps);
  const M = buildCorrelation(idx);
  ck('one row per player per stat', idx.length === 6, String(idx.length));
  ck('the diagonal is all ones', M.every((r, i) => r[i] === 1));
  ck('it is symmetric', M.every((r, i) => r.every((v, j) => v === M[j][i])));

  const find = (pid, stat) => idx.findIndex((x) => x.playerId === pid && x.stat === stat);
  ck("a player's own yards and catches are strongly correlated",
    M[find('p-chase', 'recYd')][find('p-chase', 'rec')] > 0.5);
  ck('two players in different games are not',
    M[find('p-chase', 'recYd')][find('p-nabers', 'recYd')] === 0);
  ck('the matrix is valid, so no repair is needed', safeCholesky(M).shrink === 0);
}

/* Same team, same game, and the three cases must differ. */
{
  const mate = { ...nabers, playerId: 'p-mate', team: 'CIN', eventId: 'e1' };
  const opp = { ...nabers, playerId: 'p-opp', team: 'PIT', eventId: 'e1' };
  const qb = { ...nabers, playerId: 'p-qb', team: 'CIN', eventId: 'e1', position: 'QB' };
  const ps = [chase, mate, opp, qb].map(projectPlayer);
  const idx = buildIndex(ps);
  const M = buildCorrelation(idx);
  const at = (a, b) => M[idx.findIndex((x) => x.playerId === a && x.stat === 'recYd')]
                        [idx.findIndex((x) => x.playerId === b && x.stat === 'recYd')];
  ck('two targets on one team compete, so they correlate NEGATIVELY',
    at('p-chase', 'p-mate') < 0, String(at('p-chase', 'p-mate')));
  ck('a passer and a target on one team rise together',
    at('p-chase', 'p-qb') > 0.3, String(at('p-chase', 'p-qb')));
  ck('two players in one game on opposite teams correlate mildly',
    at('p-chase', 'p-opp') > 0 && at('p-chase', 'p-opp') < 0.3,
    String(at('p-chase', 'p-opp')));
}

/* ===================================================================
 * 7. THE CLAIM THE WHOLE FILE IS FOR
 * ================================================================ */
section('Correlation moves the probability and NOT the marginals');

{
  const ps = [projectPlayer(chase), projectPlayer({ ...nabers, team: 'CIN', eventId: 'e1' })];

  const run = (between) => simulateTogether(ps, {
    n: 20000, scoring: 'ppr', seed: 9090,
    corr: { ...PLACEHOLDER_CORR, sameTeamTargets: between },
  });

  const neg = run(-0.6);
  const zero = run(0);
  const pos = run(0.6);

  const med = (s, id) => s.players.get(id).summary.p50;
  const mean = (s, id) => s.players.get(id).summary.mean;

  /* HALF ONE: each player's own distribution is untouched.
   *
   * THE BAND IS DERIVED, NOT PICKED, and the first version picked one. It
   * allowed 0.35 on the median and the three runs came back 13.86, 13.99 and
   * 14.23, a spread of 0.37. Nothing was wrong: two samples of the same
   * distribution differ, and the standard error of a sample median is about
   * 1.2533 * sd / sqrt(n), which at this spread and 20,000 draws is 0.10 per
   * sample and 0.14 on the difference between two. A 0.37 gap is under three
   * of those.
   *
   * A threshold chosen by eye against noise is a check that fails on builds
   * nobody touched, and this repo has paid for that several times over. So the
   * tolerance comes from the sample's own spread at four standard errors.
   *
   * AND THE CLAIM IS MADE ACROSS THE WHOLE DISTRIBUTION rather than at one
   * point, which is both stronger and steadier. A copula applied to the wrong
   * axis would move every quantile; noise moves them independently. Asking for
   * five agreements is far harder to pass by accident than asking for one. */
  const QS = ['p10', 'p25', 'p50', 'p75', 'p90'];
  const seMedian = (s, id) => 1.2533 * s.players.get(id).summary.sd / Math.sqrt(s.n);

  for (const id of ['p-chase', 'p-nabers']) {
    const band = 4 * Math.SQRT2 * seMedian(zero, id);
    const worst = QS.map((q) => ({
      q,
      gap: Math.abs(neg.players.get(id).summary[q] - pos.players.get(id).summary[q]),
    })).sort((a, b) => b.gap - a.gap)[0];
    ck(`${id}: every quantile is the same at every correlation`,
      worst.gap < band,
      `worst ${worst.q} off by ${worst.gap.toFixed(3)}, band ${band.toFixed(3)}`);
    ck(`${id}: and so is the mean`,
      Math.abs(mean(neg, id) - mean(pos, id)) < band,
      `${mean(neg, id).toFixed(2)} / ${mean(zero, id).toFixed(2)} / ${mean(pos, id).toFixed(2)}`);
    ck(`${id}: and so is the spread`,
      Math.abs(neg.players.get(id).summary.sd - pos.players.get(id).summary.sd) < band,
      `${neg.players.get(id).summary.sd.toFixed(2)} / ${pos.players.get(id).summary.sd.toFixed(2)}`);
  }

  /* HALF TWO: the probability does move, and in the right direction. Two
     players who rise and fall together produce fewer clear winners, so the
     probability is pulled toward the middle. Anti-correlated, one is up when
     the other is down, so the better player wins more often. */
  const pOf = (s) => compare('a', 'b',
    s.players.get('p-chase').draws, s.players.get('p-nabers').draws).pAWins;
  const pn = pOf(neg), pz = pOf(zero), pp = pOf(pos);
  console.log(`         P(Chase wins): correlated -0.6 ${(pn * 100).toFixed(1)}%, `
    + `0 ${(pz * 100).toFixed(1)}%, +0.6 ${(pp * 100).toFixed(1)}%`);
  ck('THE PROBABILITY MOVES with correlation', Math.abs(pn - pp) > 0.02,
    `${pn.toFixed(4)} against ${pp.toFixed(4)}`);

  /* THE DIRECTION, AND THE FIRST VERSION OF THIS ASSERTION HAD IT BACKWARDS.
   *
   * It asked for positive correlation to pull the answer toward a coin flip,
   * on the loose intuition that two players moving together are harder to
   * separate. The arithmetic says the opposite and the arithmetic is right:
   *
   *   Var(A - B) = Var(A) + Var(B) - 2 Cov(A, B)
   *
   * Positive covariance SHRINKS the variance of the difference, so the
   * difference sits more tightly around its mean and more of its mass falls on
   * one side of zero. The probability moves AWAY from 0.5.
   *
   * That is also why this matters to a fantasy manager rather than being a
   * technicality. Two receivers in the same game move together, so the gap
   * between them is more predictable than their individual scores are, and a
   * close call between teammates is less of a coin flip than it looks. The
   * code had this right; the note above it did not. */
  ck('positive correlation shrinks the variance of the DIFFERENCE, '
    + 'so it moves the answer AWAY from a coin flip',
    Math.abs(pp - 0.5) > Math.abs(pn - 0.5),
    `pos ${Math.abs(pp - 0.5).toFixed(4)} against neg ${Math.abs(pn - 0.5).toFixed(4)}`);

  /* And the mechanism, measured directly, so the claim above rests on the
     spread rather than on one probability that could move for other reasons. */
  const sdDiff = (s) => {
    const a = s.players.get('p-chase').draws, b = s.players.get('p-nabers').draws;
    const d = a.map((x, i) => x - b[i]);
    return summarize(d).sd;
  };
  console.log(`         sd of the difference: -0.6 ${sdDiff(neg).toFixed(2)}, `
    + `0 ${sdDiff(zero).toFixed(2)}, +0.6 ${sdDiff(pos).toFixed(2)}`);
  ck('and the spread of the difference falls as correlation rises',
    sdDiff(pos) < sdDiff(zero) && sdDiff(zero) < sdDiff(neg));
}

/* ===================================================================
 * 8. THE ANSWER
 * ================================================================ */
section('The answer Start/Sit puts on screen');

{
  const ps = [projectPlayer(chase), projectPlayer(nabers)];
  const sim = simulateTogether(ps, { n: 20000, scoring: 'ppr', seed: 1 });
  const cmp = compare('p-chase', 'p-nabers',
    sim.players.get('p-chase').draws, sim.players.get('p-nabers').draws);

  const sc = sim.players.get('p-chase').summary;
  const sn = sim.players.get('p-nabers').summary;
  console.log(`         Chase   p10 ${sc.p10.toFixed(1)}  median ${sc.p50.toFixed(1)}  `
    + `p90 ${sc.p90.toFixed(1)}  mean ${sc.mean.toFixed(1)}`);
  console.log(`         Nabers  p10 ${sn.p10.toFixed(1)}  median ${sn.p50.toFixed(1)}  `
    + `p90 ${sn.p90.toFixed(1)}  mean ${sn.mean.toFixed(1)}`);
  console.log(`         Chase outscores Nabers ${(cmp.pAWins * 100).toFixed(1)}% of the time, `
    + `expected margin ${cmp.expectedMargin > 0 ? '+' : ''}${cmp.expectedMargin.toFixed(1)}`);

  ck('the probabilities sum to one', near(cmp.pAWins + cmp.pBWins, 1, 1e-12));
  ck('it is a real probability', cmp.pAWins > 0 && cmp.pAWins < 1);
  /* THE SIGN HAS TO AGREE WITH THE PROBABILITY. A comparison where one favours
     A and the other favours B is the kind of thing that renders perfectly and
     is obviously wrong to a reader, which means it reaches a reader. */
  ck('the margin and the probability agree on who is better',
    (cmp.expectedMargin > 0) === (cmp.pAWins > 0.5),
    `margin ${cmp.expectedMargin.toFixed(2)}, p ${cmp.pAWins.toFixed(3)}`);
  ck('reversing the arguments reverses the answer', (() => {
    const back = compare('p-nabers', 'p-chase',
      sim.players.get('p-nabers').draws, sim.players.get('p-chase').draws);
    return near(back.pAWins, cmp.pBWins, 1e-12)
      && near(back.expectedMargin, -cmp.expectedMargin, 1e-9);
  })());

  const r = rank(sim);
  ck('the chances of finishing highest sum to one',
    near([...r.pHighest.values()].reduce((a, x) => a + x, 0), 1, 1e-9));
  ck('with two players, finishing highest IS the pairwise probability',
    Math.abs(r.pHighest.get('p-chase') - cmp.pAWins) < 1e-9);
}

/* Three players: finishing highest is NOT derivable from the pairwise numbers,
 * which is why it is computed from the draws. */
{
  const third = { ...chase, playerId: 'p-third', name: 'Third Man', team: 'BUF', eventId: 'e3' };
  const ps = [chase, nabers, third].map(projectPlayer);
  const sim = simulateTogether(ps, { n: 20000, scoring: 'ppr', seed: 3 });
  const r = rank(sim);
  ck('three players give three pairwise comparisons', r.pairs.length === 3);
  ck('and the chances of finishing highest still sum to one',
    near([...r.pHighest.values()].reduce((a, x) => a + x, 0), 1, 1e-9));
  ck('each is a real probability',
    [...r.pHighest.values()].every((p) => p > 0 && p < 1));
  console.log('         P(highest): '
    + [...r.pHighest.entries()].map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', '));
}

/* ===================================================================
 * 9. REPRODUCIBILITY AND SCORING
 * ================================================================ */
section('Reproducible, and scoring-specific');

{
  const ps = [projectPlayer(chase), projectPlayer(nabers)];
  const a = simulateTogether(ps, { n: 4000, scoring: 'ppr' });
  const b = simulateTogether(ps, { n: 4000, scoring: 'ppr' });
  ck('the same comparison gives the same answer every time',
    a.players.get('p-chase').summary.p50 === b.players.get('p-chase').summary.p50);

  const c = simulateTogether(ps, { n: 4000, scoring: 'ppr', seed: 12345 });
  ck('and a different seed gives a different one',
    a.players.get('p-chase').summary.p50 !== c.players.get('p-chase').summary.p50);

  ck('the seed depends on who is being compared',
    seedFor(['ppr', 1, 'a', 'b']) !== seedFor(['ppr', 1, 'a', 'c']));

  /* THE SCORING PROFILE CHANGES THE ANSWER, not just the totals. Chase and
     Nabers differ in catch volume, so the gap between them moves with the
     value of a reception. If a projection could be rescaled between profiles
     this would be impossible. */
  const half = simulateTogether(ps, { n: 20000, scoring: 'half_ppr', seed: 5 });
  const full = simulateTogether(ps, { n: 20000, scoring: 'ppr', seed: 5 });
  const pH = compare('a', 'b', half.players.get('p-chase').draws,
    half.players.get('p-nabers').draws).pAWins;
  const pF = compare('a', 'b', full.players.get('p-chase').draws,
    full.players.get('p-nabers').draws).pAWins;
  console.log(`         same two players: half ppr ${(pH * 100).toFixed(1)}%, `
    + `full ppr ${(pF * 100).toFixed(1)}%`);
  ck('changing the scoring profile changes the probability', Math.abs(pH - pF) > 0.005,
    `${pH.toFixed(4)} against ${pF.toFixed(4)}`);
  ck('every player scores more under ppr than half ppr',
    full.players.get('p-chase').summary.mean > half.players.get('p-chase').summary.mean
    && full.players.get('p-nabers').summary.mean > half.players.get('p-nabers').summary.mean);
}

ck('the placeholder correlation is flagged as a placeholder',
  simulateTogether([projectPlayer(chase)], { n: 200 }).placeholderCorrelation === true);
ck('and a supplied matrix is not',
  simulateTogether([projectPlayer(chase)], {
    n: 200, corr: { ...PLACEHOLDER_CORR },
  }).placeholderCorrelation === false);

ck('simulating nothing is refused', threw(() => simulateTogether([], {})) !== null);
ck('comparing samples of different length is refused',
  threw(() => compare('a', 'b', [1, 2, 3], [1, 2])) !== null);

/* ------------------------------------------------------------------ */
console.log('');
if (fails) {
  console.error(`${fails} of ${ran} checks failed.`);
  process.exit(1);
}
console.log(`${ran} checks passed.`);
