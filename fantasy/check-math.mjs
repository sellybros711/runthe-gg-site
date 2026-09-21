/* The projection maths, where a bug is silent.
 *
 *   node fantasy/check-math.mjs
 *
 * No network, no browser, no database. Pure functions in, numbers out.
 *
 *
 * WHY THIS FILE IS LONGER THAN THE CODE IT CHECKS
 * ---------------------------------------------------------------------------
 * Every failure mode in fantasy/lib/ produces a plausible number. A de-vig
 * that forgets to normalize returns 0.52 instead of 0.50 and nothing
 * anywhere throws; the projection is wrong by the size of the bookmaker's
 * margin, in the same direction, on every player, all season, and the screen
 * looks exactly as it should. A fitter whose bisection returns a bracket end
 * gives a confident answer to a question it never solved.
 *
 * So the checks are of three kinds, and the third is the one that earns its
 * keep:
 *
 *   1. HAND VALUES. Arithmetic somebody can verify with a calculator.
 *   2. IDENTITIES. Things that must be exactly true: probabilities sum to one,
 *      a fit reproduces the tail it was fitted to, scoring a zero line is zero.
 *   3. PROPERTIES SWEPT ACROSS THE RANGE. Monotonicity, ordering, and the
 *      shape of the answer, checked at hundreds of inputs rather than at one.
 *      A single spot check passes on a function that turns round two steps
 *      later, and this repo has already paid for that twice: the mythiball
 *      send curve had a cliff at a seam where every value either side was a
 *      valid probability, and a rating that bought you LESS survived until
 *      somebody swept it.
 */
import {
  americanToProb, probToAmerican, overround,
  devigMultiplicative, devigShin, devigTwoWay, shinZ, devig, DEVIG_METHODS,
} from './lib/devig.mjs';
import {
  PROFILES, PROFILE_KEYS, profile, customProfile, pointsFor, pointsForEach,
} from './lib/scoring.mjs';
import {
  gammaln, lowerRegGamma, gammaCdf, gammaSf, fitGammaToTail,
  negBinPmf, negBinSfAtLeast, fitNegBinToTail, tdLambdaFromAnytime,
  rng, normalSampler, sampleGamma, sampleNegBin, samplePoisson, sampleFit,
  quantile, summarize,
} from './lib/dist.mjs';

let fails = 0;
let ran = 0;
const ck = (label, cond, detail) => {
  ran++;
  console.log((cond ? ' ok   ' : ' FAIL ') + label + (cond || !detail ? '' : `\n         ${detail}`));
  if (!cond) fails++;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const section = (s) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);

console.log('\nThe projection maths');

/* =====================================================================
 * 1. AMERICAN ODDS
 * ================================================================== */
section('American odds');

ck('+150 is 40 percent', near(americanToProb(150), 0.4));
ck('-150 is 60 percent', near(americanToProb(-150), 0.6));
ck('-110 is 110/210', near(americanToProb(-110), 110 / 210));
ck('+100 and -100 both mean evens',
  near(americanToProb(100), 0.5) && near(americanToProb(-100), 0.5));

/* THE FORBIDDEN BAND. American odds have a hole in them: nothing lies strictly
 * between -100 and +100. A price in there is a provider bug or a parse bug,
 * and the dangerous version of this function returns a plausible number for it
 * and buries the bug inside a projection. */
for (const bad of [0, 50, -50, 99, -99]) {
  ck(`${bad} is refused rather than guessed at`, threw(() => americanToProb(bad)) !== null);
}
ck('a non-number is refused', threw(() => americanToProb('abc')) !== null);

/* Round trip, swept rather than spot checked. The rounding means it is not
 * exact, so the claim is that it lands within half a tick. */
{
  let worst = 0;
  for (let p = 0.02; p < 0.98; p += 0.001) {
    const back = americanToProb(probToAmerican(p));
    worst = Math.max(worst, Math.abs(back - p));
  }
  ck('price and probability round trip across the whole range', worst < 0.005,
    `worst error ${worst.toFixed(5)}`);
}
ck('probToAmerican never lands in the forbidden band', (() => {
  for (let p = 0.02; p < 0.98; p += 0.001) {
    const a = probToAmerican(p);
    if (a > -100 && a < 100) return false;
  }
  return true;
})());

ck('a -110 both ways book is about 4.8 percent over',
  near(overround([-110, -110]), 2 * (110 / 210), 1e-12));

/* =====================================================================
 * 2. DE-VIG
 * ================================================================== */
section('De-vig');

for (const method of DEVIG_METHODS) {
  const r = devig([-110, -110], method);
  ck(`${method}: a symmetric book gives exactly 50/50`,
    near(r[0], 0.5, 1e-9) && near(r[1], 0.5, 1e-9), JSON.stringify(r));
}

/* THE IDENTITY THAT CANNOT BE ALLOWED TO DRIFT. Everything downstream
 * multiplies these together. Swept over a wide range of books rather than
 * checked once, including the lopsided ones an anytime touchdown market
 * actually produces. */
{
  const books = [];
  for (const a of [-2000, -400, -190, -130, -110, 105, 140, 260, 450, 1200]) {
    for (const b of [-2000, -400, -190, -130, -110, 105, 140, 260, 450, 1200]) {
      if (overround([a, b]) > 1) books.push([a, b]);
    }
  }
  let bad = null;
  for (const m of DEVIG_METHODS) {
    for (const bk of books) {
      const s = devig(bk, m).reduce((x, y) => x + y, 0);
      if (!near(s, 1, 1e-9)) { bad = `${m} ${bk} summed to ${s}`; break; }
    }
  }
  ck(`both methods sum to exactly 1 across ${books.length} real books`, bad === null, bad);

  /* Ordering must survive. A de-vig that reordered the outcomes would be
     catastrophic and completely invisible in a single symmetric test. */
  let flipped = null;
  for (const m of DEVIG_METHODS) {
    for (const bk of books) {
      const raw = bk.map(americanToProb);
      const fair = devig(bk, m);
      if ((raw[0] > raw[1]) !== (fair[0] > fair[1]) && !near(raw[0], raw[1], 1e-12)) {
        flipped = `${m} ${bk}`; break;
      }
    }
  }
  ck('neither method ever reorders the outcomes', flipped === null, flipped);

  /* Every fair probability must be BELOW its raw implied probability, because
     removing margin can only take probability away. This is the check that
     catches a normalization written upside down. */
  let up = null;
  for (const m of DEVIG_METHODS) {
    for (const bk of books) {
      const raw = bk.map(americanToProb);
      const fair = devig(bk, m);
      for (let i = 0; i < 2; i++) {
        if (fair[i] > raw[i] + 1e-12) { up = `${m} ${bk} outcome ${i}: ${raw[i]} -> ${fair[i]}`; break; }
      }
    }
  }
  ck('de-vigging never increases a probability', up === null, up);
}

/* A book with no margin has nothing to remove. Both methods must be the
 * identity, and Shin's z must be zero. */
{
  const fair = [probToAmerican(0.4), probToAmerican(0.6)];
  const b = overround(fair);
  ck('a fair book is already normalized', near(b, 1, 0.002), `overround ${b}`);
  ck('shin z is 0 on a book with no margin', shinZ([-100, 100]) < 1e-6);
}

/* SHIN AND MULTIPLICATIVE MUST DISAGREE ON A LOPSIDED MARKET, and agree on a
 * balanced one. That is the whole reason both exist. If they agreed
 * everywhere, keeping two would be pointless and the configurable method would
 * be a decision nobody needs to make.
 *
 * The DIRECTION is measured and reported rather than asserted, because which
 * way Shin pushes is a property of the model, not something worth pinning from
 * memory. What is asserted is that the gap is real and that it grows with how
 * lopsided the book is. */
{
  const balanced = [-110, -110];
  const lopsided = [450, -700];
  const mb = devigMultiplicative(balanced), sb = devigShin(balanced);
  const ml = devigMultiplicative(lopsided), sl = devigShin(lopsided);
  const gapB = Math.abs(mb[0] - sb[0]);
  const gapL = Math.abs(ml[0] - sl[0]);
  ck('the two methods agree on a balanced book', gapB < 1e-6, `gap ${gapB}`);
  ck('and disagree on a lopsided one', gapL > 1e-3, `gap ${gapL}`);
  ck('the disagreement grows with how lopsided the book is', gapL > gapB * 100);
  console.log(`         longshot side: multiplicative ${ml[0].toFixed(4)}, `
    + `shin ${sl[0].toFixed(4)}, shin is ${sl[0] < ml[0] ? 'lower' : 'higher'}`);
  console.log(`         shin z on that book: ${shinZ(lopsided).toFixed(4)}`);
}

ck('shin z is a proper fraction on every real book', (() => {
  for (const bk of [[-110, -110], [450, -700], [-2000, 900], [120, -140]]) {
    const z = shinZ(bk);
    if (!(z >= 0 && z < 1)) return false;
  }
  return true;
})());

ck('an unknown method is refused rather than silently defaulted',
  threw(() => devig([-110, -110], 'vegas-magic')) !== null);

/* The named two-way wrapper, because [0] and [1] at a call site is a sign
 * error waiting to happen. */
{
  const r = devigTwoWay(-200, 170);
  ck('devigTwoWay names the sides and over is the favourite here',
    r.over > r.under && near(r.over + r.under, 1, 1e-9));
  ck('and it reports the overround it removed', r.overround > 1);
}

/* =====================================================================
 * 3. SCORING
 * ================================================================== */
section('Scoring');

const LINE = { recYd: 90, rec: 6, recTd: 1, rushYd: 10 };

ck('standard: 90 rec yds + 10 rush + 1 TD = 16',
  near(pointsFor(LINE, 'standard'), 16));
ck('half ppr adds 0.5 a catch', near(pointsFor(LINE, 'half_ppr'), 19));
ck('ppr adds 1 a catch', near(pointsFor(LINE, 'ppr'), 22));

ck('a quarterback line scores at 0.04 a yard and 4 a touchdown',
  near(pointsFor({ passYd: 300, passTd: 2, passInt: 1 }, 'ppr'), 12 + 8 - 2));

ck('an empty line is zero under every profile',
  PROFILE_KEYS.every((k) => pointsFor({}, k) === 0));

ck('a missing stat and an explicit zero score the same',
  pointsFor({ recYd: 50 }, 'ppr') === pointsFor({ recYd: 50, rec: 0, recTd: 0 }, 'ppr'));

/* A NaN in a draw must not survive into a distribution. One NaN turns every
 * quantile into NaN and the screen then shows blanks that look like missing
 * data rather than a bug. */
ck('a NaN stat is refused loudly', threw(() => pointsFor({ recYd: NaN }, 'ppr')) !== null);

ck('an unknown profile is refused', threw(() => profile('superflex-ppr-te++')) !== null);

/* THE CLAIM THE WHOLE FILE IS BUILT ON: scoring is not a rescale.
 *
 * Two players with the SAME half PPR score and different shapes must separate
 * under PPR. If a single projection could be adjusted after the fact, these
 * two would move together, and the brief's rule would be a style preference
 * rather than arithmetic. */
/* THE FIXTURE HAS TO BE SOLVED, NOT GUESSED, and the first version of it was
 * guessed. 8 catches for 40 and 3 for 90 were picked by eye as "same half PPR,
 * different shape". They are not: they tie at 12 under PPR and differ by 2.5
 * under half. The claim was right and the numbers demonstrated it backwards,
 * which the check caught on its first run.
 *
 * Solved instead. Tying under half PPR means 0.5*r + 0.1*y equal for both, and
 * the PPR gap is then exactly 0.5 * (difference in catches), so any pair with
 * different catch counts separates and by a knowable amount. */
{
  const volume = { rec: 8, recYd: 40 };     // 4 + 4 = 8 under half
  const chunk = { rec: 2, recYd: 70 };      // 1 + 7 = 8 under half
  const halfV = pointsFor(volume, 'half_ppr');
  const halfC = pointsFor(chunk, 'half_ppr');
  ck('two shapes chosen to tie in half ppr do tie', near(halfV, halfC),
    `${halfV} against ${halfC}`);

  const pprV = pointsFor(volume, 'ppr');
  const pprC = pointsFor(chunk, 'ppr');
  ck('AND THEY SEPARATE IN PPR, so a projection cannot be rescaled between profiles',
    Math.abs(pprV - pprC) > 2, `${pprV} against ${pprC}`);
  ck('and they separate by exactly half the difference in catches',
    near(pprV - pprC, 0.5 * (volume.rec - chunk.rec)),
    `${(pprV - pprC).toFixed(2)} against ${(0.5 * (volume.rec - chunk.rec)).toFixed(2)}`);
}

/* TE premium reads the position argument and nothing in the stat line. */
{
  const tep = customProfile('te_prem', { rec: 1, tePremiumRec: 0.5 });
  const l = { rec: 6, recYd: 60 };
  ck('a tight end gets the premium', near(pointsFor(l, tep, 'TE'), 6 + 6 + 3));
  ck('a receiver does not', near(pointsFor(l, tep, 'WR'), 6 + 6));
  ck('and neither does a line with no position given', near(pointsFor(l, tep), 6 + 6));
}

ck('a typo in a custom profile is refused rather than ignored',
  threw(() => customProfile('oops', { recieptions: 1 })) !== null);

/* Bonuses are thresholds, paid once and whole. */
{
  const bon = customProfile('bonus', { rec: 1, bonuses: [{ stat: 'recYd', at: 100, points: 3 }] });
  ck('99 yards misses the bonus', near(pointsFor({ recYd: 99 }, bon), 9.9));
  ck('100 yards takes it', near(pointsFor({ recYd: 100 }, bon), 10 + 3));
  ck('200 yards takes it once, not twice', near(pointsFor({ recYd: 200 }, bon), 20 + 3));
}

ck('pointsForEach scores one draw under several profiles',
  (() => {
    const r = pointsForEach(LINE, ['standard', 'half_ppr', 'ppr']);
    return near(r.standard, 16) && near(r.half_ppr, 19) && near(r.ppr, 22);
  })());

/* =====================================================================
 * 4. SPECIAL FUNCTIONS
 * ================================================================== */
section('Special functions');

ck('gammaln(1) = 0', near(gammaln(1), 0, 1e-12));
ck('gammaln(2) = 0', near(gammaln(2), 0, 1e-12));
ck('gammaln(5) = ln(24)', near(gammaln(5), Math.log(24), 1e-10));
ck('gammaln(0.5) = ln(sqrt(pi))', near(gammaln(0.5), Math.log(Math.sqrt(Math.PI)), 1e-10));

/* The exponential is gamma with shape 1, so its CDF is one we all know. */
ck('P(1,1) = 1 - 1/e', near(lowerRegGamma(1, 1), 1 - Math.exp(-1), 1e-12));
ck('P(1,3) = 1 - e^-3', near(lowerRegGamma(1, 3), 1 - Math.exp(-3), 1e-12));
/* Shape 2 has a closed form too, and it lands on the other side of the
   series/continued-fraction transition, so this checks both branches. */
ck('P(2,1) = 1 - 2/e', near(lowerRegGamma(2, 1), 1 - 2 * Math.exp(-1), 1e-12));
ck('P(2,8) matches its closed form',
  near(lowerRegGamma(2, 8), 1 - 9 * Math.exp(-8), 1e-12));
ck('P(s,0) = 0', lowerRegGamma(3, 0) === 0);

ck('the CDF is monotone in x across both branches', (() => {
  for (const s of [0.5, 1, 2, 4, 9, 25]) {
    let prev = -1;
    for (let x = 0; x < 60; x += 0.05) {
      const v = lowerRegGamma(s, x);
      if (v < prev - 1e-12 || v < -1e-12 || v > 1 + 1e-12) return false;
      prev = v;
    }
  }
  return true;
})());

/* =====================================================================
 * 5. FITTING A DISTRIBUTION TO A LINE
 * ================================================================== */
section('Fitting');

/* THE FIT MUST REPRODUCE THE MARKET IT WAS FITTED TO. This is the identity
 * that catches a bisection returning a bracket end: the answer is a number,
 * it looks fine, and it solves nothing. Swept over lines and probabilities
 * rather than checked once. */
{
  let worst = 0, at = null;
  for (const line of [8.5, 24.5, 45.5, 61.5, 88.5, 275.5]) {
    for (const p of [0.12, 0.3, 0.45, 0.5, 0.58, 0.72, 0.88]) {
      for (const cv of [0.3, 0.5, 0.7, 1.0]) {
        const f = fitGammaToTail(line, p, cv);
        const back = gammaSf(line, f.shape, f.scale);
        if (Math.abs(back - p) > worst) { worst = Math.abs(back - p); at = `${line}/${p}/${cv}`; }
      }
    }
  }
  ck('every gamma fit reproduces its own tail probability', worst < 1e-8,
    `worst ${worst} at ${at}`);
}

ck('the gamma cv comes out as the prior asked for', (() => {
  for (const cv of [0.3, 0.5, 0.7, 1.0]) {
    const f = fitGammaToTail(61.5, 0.5, cv);
    if (!near(f.sd / f.mean, cv, 1e-9)) return false;
  }
  return true;
})());

/* MONOTONE IN THE MARKET. A higher chance of going over must mean a bigger
 * projection. Without this, a line moving in the player's favour could quietly
 * lower his number. */
ck('a higher over probability always means a higher mean', (() => {
  for (const cv of [0.4, 0.7, 1.0]) {
    let prev = -1;
    for (let p = 0.05; p < 0.95; p += 0.01) {
      const m = fitGammaToTail(61.5, p, cv).mean;
      if (m <= prev) return false;
      prev = m;
    }
  }
  return true;
})());

/* THE SKEW, WHICH IS WHY THE LINE IS NOT THE PROJECTION. At a 50/50 line the
 * mean of a right skewed distribution sits ABOVE the line, because the line is
 * the median. Reading the line as the projection understates it. */
{
  const f = fitGammaToTail(61.5, 0.5, 0.7);
  ck('at a 50/50 line the mean sits above the line, not on it',
    f.mean > 61.5 * 1.02, `line 61.5, mean ${f.mean.toFixed(2)}`);
  console.log(`         a 61.5 line at even money projects ${f.mean.toFixed(1)} mean, `
    + `${f.sd.toFixed(1)} sd`);
}

ck('an impossible probability is refused', threw(() => fitGammaToTail(61.5, 0, 0.7)) !== null);
ck('a negative line is refused', threw(() => fitGammaToTail(-5, 0.5, 0.7)) !== null);
ck('a zero cv is refused', threw(() => fitGammaToTail(61.5, 0.5, 0)) !== null);

/* Negative binomial. */
{
  ck('the negbin pmf sums to 1', (() => {
    let s = 0;
    for (let k = 0; k <= 400; k++) s += negBinPmf(k, 6, 6);
    return near(s, 1, 1e-9);
  })());

  ck('r = 1 is the geometric distribution', (() => {
    const mean = 4, r = 1, p = r / (r + mean);
    for (let k = 0; k < 8; k++) {
      if (!near(negBinPmf(k, mean, r), p * Math.pow(1 - p, k), 1e-12)) return false;
    }
    return true;
  })());

  ck('its variance is mean + mean^2/r', (() => {
    const mean = 5, r = 6;
    let m1 = 0, m2 = 0;
    for (let k = 0; k <= 500; k++) { const q = negBinPmf(k, mean, r); m1 += k * q; m2 += k * k * q; }
    return near(m1, mean, 1e-6) && near(m2 - m1 * m1, mean + mean * mean / r, 1e-5);
  })());

  let worst = 0;
  for (const line of [1.5, 3.5, 4.5, 6.5, 9.5]) {
    for (const p of [0.2, 0.4, 0.5, 0.6, 0.8]) {
      const f = fitNegBinToTail(line, p, 6);
      worst = Math.max(worst, Math.abs(negBinSfAtLeast(f.atLeast, f.mean, f.r) - p));
    }
  }
  ck('every negbin fit reproduces its own tail probability', worst < 1e-8, `worst ${worst}`);

  ck('a 4.5 line is read as "5 or more"', fitNegBinToTail(4.5, 0.5, 6).atLeast === 5);
  ck('a higher over probability always means more catches', (() => {
    let prev = -1;
    for (let p = 0.05; p < 0.95; p += 0.01) {
      const m = fitNegBinToTail(4.5, p, 6).mean;
      if (m <= prev) return false;
      prev = m;
    }
    return true;
  })());
}

/* Anytime touchdown. */
{
  for (const p of [0.1, 0.35, 0.5, 0.72, 0.9]) {
    const lam = tdLambdaFromAnytime(p);
    ck(`lambda from a ${(p * 100).toFixed(0)} percent anytime price reproduces P(at least one)`,
      near(1 - Math.exp(-lam), p, 1e-12));
  }
  /* THE POINT OF MODELLING IT AS A COUNT AT ALL. Expected touchdowns must
     EXCEED the anytime probability, because some of those players score
     twice. Reading the anytime price as an expectation undercounts every
     high-volume back. */
  const p = 0.6, lam = tdLambdaFromAnytime(p);
  ck('expected touchdowns exceed the anytime probability', lam > p,
    `p ${p}, lambda ${lam.toFixed(4)}`);
  ck('a certainty is refused rather than producing an infinite lambda',
    threw(() => tdLambdaFromAnytime(1)) !== null);
}

/* =====================================================================
 * 6. SAMPLING
 * ================================================================== */
section('Sampling');

ck('the generator is deterministic for a seed', (() => {
  const a = rng(42), b = rng(42);
  for (let i = 0; i < 100; i++) if (a() !== b()) return false;
  return true;
})());
ck('and different seeds differ', rng(1)() !== rng(2)());

{
  const next = rng(7);
  const n = 200000;
  let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const x = next(); s += x; s2 += x * x; }
  const m = s / n, v = s2 / n - m * m;
  ck('uniform draws have the right mean and variance',
    near(m, 0.5, 0.005) && near(v, 1 / 12, 0.002), `mean ${m.toFixed(4)} var ${v.toFixed(4)}`);
}

{
  const normal = normalSampler(rng(11));
  const n = 200000;
  let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const x = normal(); s += x; s2 += x * x; }
  const m = s / n, v = s2 / n - m * m;
  ck('normal draws are standard normal',
    near(m, 0, 0.01) && near(v, 1, 0.02), `mean ${m.toFixed(4)} var ${v.toFixed(4)}`);
}

/* THE SAMPLER MUST AGREE WITH THE FITTER. They are two implementations of one
 * distribution and nothing else in this product would notice if they drifted:
 * the fit would be right, the draws would be from something else, and every
 * number on the screen would be a plausible number from the wrong model. */
{
  const f = fitGammaToTail(61.5, 0.5, 0.7);
  const next = rng(99);
  const n = 120000;
  const draws = new Array(n);
  for (let i = 0; i < n; i++) draws[i] = sampleFit(f, next);
  const st = summarize(draws);
  ck('sampled gamma mean matches the fitted mean',
    Math.abs(st.mean - f.mean) / f.mean < 0.01,
    `fit ${f.mean.toFixed(2)}, sampled ${st.mean.toFixed(2)}`);
  ck('sampled gamma sd matches the fitted sd',
    Math.abs(st.sd - f.sd) / f.sd < 0.02,
    `fit ${f.sd.toFixed(2)}, sampled ${st.sd.toFixed(2)}`);
  /* And the fitted tail is reproduced BY THE DRAWS, which is the end to end
     version of the identity: market in, draws out, market back. */
  const over = draws.filter((x) => x > 61.5).length / n;
  ck('the share of draws over the line is the market probability',
    Math.abs(over - 0.5) < 0.01, `${(over * 100).toFixed(1)} percent`);
}

{
  const f = fitNegBinToTail(4.5, 0.55, 6);
  const next = rng(123);
  const n = 120000;
  const draws = new Array(n);
  for (let i = 0; i < n; i++) draws[i] = sampleFit(f, next);
  const mean = draws.reduce((a, x) => a + x, 0) / n;
  ck('sampled negbin mean matches the fitted mean',
    Math.abs(mean - f.mean) / f.mean < 0.02, `fit ${f.mean.toFixed(3)}, sampled ${mean.toFixed(3)}`);
  const over = draws.filter((x) => x >= 5).length / n;
  ck('the share of draws at 5 or more is the market probability',
    Math.abs(over - 0.55) < 0.01, `${(over * 100).toFixed(1)} percent`);
  ck('every draw is a non-negative integer', draws.every((x) => Number.isInteger(x) && x >= 0));
}

{
  const next = rng(5);
  const n = 200000;
  let s = 0;
  for (let i = 0; i < n; i++) s += samplePoisson(1.2, next);
  ck('poisson draws have the right mean', near(s / n, 1.2, 0.02), `${(s / n).toFixed(4)}`);
}

ck('an unknown fit kind is refused', threw(() => sampleFit({ kind: 'wishful' }, rng(1))) !== null);

/* =====================================================================
 * 7. QUANTILES
 * ================================================================== */
section('Quantiles');

{
  const s = [1, 2, 3, 4, 5];
  ck('the median of 1..5 is 3', quantile(s, 0.5) === 3);
  ck('q=0 is the minimum and q=1 the maximum',
    quantile(s, 0) === 1 && quantile(s, 1) === 5);
  ck('it interpolates between order statistics', near(quantile(s, 0.25), 2));
  ck('an empty sample is refused', threw(() => quantile([], 0.5)) !== null);
  const st = summarize([1, 2, 3, 4, 5]);
  ck('summarize reports the quantiles in order',
    st.p10 <= st.p25 && st.p25 <= st.p50 && st.p50 <= st.p75 && st.p75 <= st.p90);
  ck('and does not mutate its input', s[0] === 1 && s[4] === 5);
}

/* =====================================================================
 * 8. END TO END: a real market becomes a projection
 * ================================================================== */
section('End to end');

/* A receiver, priced the way a book actually prices one, all the way through
 * to fantasy points. Every number below is derived; nothing is asserted about
 * the answer except the properties that must hold. */
{
  const markets = {
    recYds: { line: 61.5, over: -115, under: -105 },
    receptions: { line: 4.5, over: -130, under: +105 },
    anytimeTd: { yes: +190, no: -240 },
  };

  const yd = devigTwoWay(markets.recYds.over, markets.recYds.under);
  const rc = devigTwoWay(markets.receptions.over, markets.receptions.under);
  const td = devigTwoWay(markets.anytimeTd.yes, markets.anytimeTd.no);

  const fYd = fitGammaToTail(markets.recYds.line, yd.over, 0.70);
  const fRc = fitNegBinToTail(markets.receptions.line, rc.over, 6);
  const lamTd = tdLambdaFromAnytime(td.over);

  const next = rng(2026);
  const n = 20000;
  const ppr = new Array(n);
  const half = new Array(n);
  for (let i = 0; i < n; i++) {
    const line = {
      recYd: sampleFit(fYd, next),
      rec: sampleFit(fRc, next),
      recTd: samplePoisson(lamTd, next),
    };
    ppr[i] = pointsFor(line, 'ppr');
    half[i] = pointsFor(line, 'half_ppr');
  }
  const sp = summarize(ppr), sh = summarize(half);

  console.log(`         market: 61.5 yds (${markets.recYds.over}/${markets.recYds.under}), `
    + `4.5 rec (${markets.receptions.over}/${markets.receptions.under}), `
    + `anytime ${markets.anytimeTd.yes}`);
  console.log(`         fair:   over ${yd.over.toFixed(3)} yds, ${rc.over.toFixed(3)} rec, `
    + `${td.over.toFixed(3)} td`);
  console.log(`         PPR     p10 ${sp.p10.toFixed(1)}  median ${sp.p50.toFixed(1)}  `
    + `p90 ${sp.p90.toFixed(1)}  mean ${sp.mean.toFixed(1)}`);
  console.log(`         half    p10 ${sh.p10.toFixed(1)}  median ${sh.p50.toFixed(1)}  `
    + `p90 ${sh.p90.toFixed(1)}  mean ${sh.mean.toFixed(1)}`);

  ck('the projection is a spread, not a point', sp.p90 - sp.p10 > 5);
  ck('ppr scores above half ppr for the same draws', sp.mean > sh.mean);
  ck('the gap is about one point per expected catch',
    near(sp.mean - sh.mean, 0.5 * fRc.mean, 0.2),
    `gap ${(sp.mean - sh.mean).toFixed(2)}, half of ${fRc.mean.toFixed(2)} catches`);
  ck('nothing is negative', sp.p10 >= 0);
  ck('the median is below the mean, because the distribution is right skewed',
    sp.p50 < sp.mean);
}

/* ------------------------------------------------------------------ */
console.log('');
if (fails) {
  console.error(`${fails} of ${ran} checks failed.`);
  process.exit(1);
}
console.log(`${ran} checks passed.`);
