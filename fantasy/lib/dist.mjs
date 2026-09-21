/* Recovering a distribution from a betting line.
 *
 * A posted market gives one fact: at line L, the fair probability of going
 * over is p. That is a single point on a cumulative distribution, and a point
 * is not a distribution. Something has to supply the SHAPE.
 *
 * So every fit here takes the market's point and a shape prior, and solves for
 * the one remaining parameter. The prior comes from the cold path, measured
 * from that player's own game logs where there are enough of them and from the
 * position's pooled history where there are not. The defaults in this file are
 * placeholders with a loud name, because a prior invented at a keyboard is
 * exactly the folklore the brief says to keep out of this product.
 *
 *
 * WHY NOT JUST USE THE LINE AS THE PROJECTION
 * ---------------------------------------------------------------------------
 * Because the line is not the mean, and for fantasy football the difference is
 * the entire product. Receiving yards are right skewed: a receiver with a 61.5
 * yard line goes under it more often than over and still averages more than
 * 61.5, because the misses are bounded at zero and the hits are not. Reading
 * the line as a projection understates every skewed market in the same
 * direction, and Start/Sit is a comparison, so a bias that lands on both
 * players unequally decides the answer.
 *
 * It also cannot answer the question the tool exists to answer. "Chase beats
 * Nabers 61 percent of the time" needs two distributions. Two point estimates
 * give you a winner and no idea whether it is close.
 *
 *
 * WHAT IS HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------
 * Fitting and sampling for the three shapes the markets need: gamma for
 * yardage, negative binomial for counts, Bernoulli for anytime touchdown.
 * Joining them into a player, and correlating players, is the next file.
 */

/* ---------------------------------------------------------------------------
 * Special functions
 * ------------------------------------------------------------------------ */

/* Lanczos approximation. Accurate to about fifteen significant figures across
 * the range anything here asks for, which is well beyond what a betting line
 * quoted to half a yard can justify. */
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function gammaln(x) {
  if (x < 0.5) {
    // reflection, so the series is only ever evaluated where it converges well
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  }
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/* The regularized lower incomplete gamma P(s, x), which is the gamma CDF with
 * the scale divided out. Series below the transition and continued fraction
 * above it, which is the standard split: each converges fast on its own side
 * and neither does on the other.
 *
 * THE ITERATION CAPS ARE NOT DECORATION. Both loops converge in well under
 * twenty steps for anything a football market produces, and both would spin
 * for ever on a NaN. A projection pipeline that hangs is worse than one that
 * returns a wrong number, because the wrong number is at least visible. */
export function lowerRegGamma(s, x) {
  if (!(s > 0)) throw new Error(`lowerRegGamma: shape must be positive, got ${s}`);
  if (x < 0) throw new Error(`lowerRegGamma: x must be non-negative, got ${x}`);
  if (x === 0) return 0;

  if (x < s + 1) {
    let ap = s, sum = 1 / s, del = sum;
    for (let i = 0; i < 300; i++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + s * Math.log(x) - gammaln(s));
  }

  const TINY = 1e-300;
  let b = x + 1 - s;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 300; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;  if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  const q = Math.exp(-x + s * Math.log(x) - gammaln(s)) * h;
  return 1 - q;
}

/* ---------------------------------------------------------------------------
 * Gamma, for yardage
 * ------------------------------------------------------------------------ */

/* Gamma rather than lognormal, and the choice is defensible either way. Both
 * are positive, both are right skewed, both fit a single tail point with a
 * shape prior. Gamma wins on two practical points: it has a closed form CDF
 * that is cheap and accurate here, and its shape parameter IS the squared
 * inverse coefficient of variation, so a prior expressed as "this receiver's
 * week to week spread is about 70 percent of his mean" maps to it directly
 * with no algebra in between.
 *
 * Lognormal is left as a live option rather than dismissed: the two disagree
 * in the far right tail, which is where a boom week lives, and which of them
 * is right is a measurement the cold path should make against real game logs
 * rather than an argument to settle here. */

export const gammaCdf = (x, shape, scale) =>
  x <= 0 ? 0 : lowerRegGamma(shape, x / scale);

export const gammaSf = (x, shape, scale) => 1 - gammaCdf(x, shape, scale);

/* PLACEHOLDER PRIORS, NAMED SO THEY CANNOT BE MISTAKEN FOR MEASUREMENTS.
 *
 * Coefficient of variation by market. Every one of these is a guess, and the
 * brief is explicit that anything not estimated in house is folklore. They are
 * here so the pipeline runs end to end before the cold path exists, and the
 * fitting functions REQUIRE a cv rather than defaulting to one, so nothing can
 * quietly use a guess without a caller having reached for it. */
export const PLACEHOLDER_CV = {
  player_pass_yds: 0.35,
  player_rush_yds: 0.65,
  player_reception_yds: 0.70,
};

/* Solve for the scale that puts the market's probability where the market put
 * it, holding the shape fixed at what the prior implies.
 *
 *   shape = 1 / cv^2      because for a gamma, cv = 1/sqrt(shape)
 *   scale                 solved so that P(X > line) = pOver
 *
 * Monotone in scale, which is what makes bisection safe: a bigger scale moves
 * mass right, so P(X > line) only ever rises. Asserted in check-math rather
 * than assumed, because "obviously monotone" is how a bisection ends up
 * returning whichever bracket end it started at. */
export function fitGammaToTail(line, pOver, cv, { tol = 1e-10, maxIter = 200 } = {}) {
  if (!(line > 0)) throw new Error(`fitGammaToTail: line must be positive, got ${line}`);
  if (!(pOver > 0 && pOver < 1)) {
    throw new Error(`fitGammaToTail: pOver must be strictly between 0 and 1, got ${pOver}`);
  }
  if (!(cv > 0)) throw new Error(`fitGammaToTail: cv must be positive, got ${cv}`);

  const shape = 1 / (cv * cv);

  /* Bracket wide enough that no football market escapes it, and checked rather
     than trusted: a bracket that does not contain the root makes bisection
     return a confident wrong answer. */
  let lo = line / (shape * 1000);
  let hi = (line * 1000) / shape;
  if (gammaSf(line, shape, lo) > pOver || gammaSf(line, shape, hi) < pOver) {
    throw new Error(`fitGammaToTail: no scale brackets pOver=${pOver} at line=${line}, cv=${cv}`);
  }

  for (let i = 0; i < maxIter; i++) {
    const mid = Math.sqrt(lo * hi);          // geometric, since scale spans orders of magnitude
    const p = gammaSf(line, shape, mid);
    if (Math.abs(p - pOver) < tol) { lo = hi = mid; break; }
    if (p < pOver) lo = mid; else hi = mid;
  }
  const scale = Math.sqrt(lo * hi);
  return {
    kind: 'gamma',
    shape,
    scale,
    mean: shape * scale,
    sd: Math.sqrt(shape) * scale,
  };
}

/* ---------------------------------------------------------------------------
 * Negative binomial, for receptions
 * ------------------------------------------------------------------------ */

/* Receptions are a count, and a count that is overdispersed relative to
 * Poisson: a receiver's catch total varies more than his own average would
 * imply under Poisson, because the target share itself moves week to week.
 * Negative binomial is Poisson with that extra variance, parameterized here by
 * the mean and a dispersion r, where
 *
 *   variance = mean + mean^2 / r
 *
 * so a large r is nearly Poisson and a small r is very spread out.
 *
 * THE LINE IS A HALF, AND THAT MATTERS. Books quote receptions at 4.5, never
 * at 4, precisely so there is no push. So "over 4.5" is "5 or more", and the
 * fit solves against P(X >= 5). Treating 4.5 as a continuous threshold and
 * interpolating would put the answer between two integers the variable cannot
 * take. */

export function negBinPmf(k, mean, r) {
  if (k < 0 || !Number.isInteger(k)) return 0;
  const lp = gammaln(k + r) - gammaln(r) - gammaln(k + 1)
    + r * Math.log(r / (r + mean)) + k * Math.log(mean / (r + mean));
  return Math.exp(lp);
}

/* P(X >= k). Summed directly rather than through an incomplete beta, because
 * the counts here are small (nobody catches forty passes) and a sum of terms
 * we can each check by hand is worth more than a closed form we cannot.
 *
 * The cap is a safety net: at mean 8 the terms are negligible past 40, and a
 * NaN mean would otherwise loop for ever. */
export function negBinSfAtLeast(k, mean, r, { cap = 200 } = {}) {
  if (k <= 0) return 1;
  let below = 0;
  for (let i = 0; i < k && i < cap; i++) below += negBinPmf(i, mean, r);
  return Math.max(0, Math.min(1, 1 - below));
}

export const PLACEHOLDER_DISPERSION = { player_receptions: 6 };

export function fitNegBinToTail(line, pOver, r, { tol = 1e-10, maxIter = 200 } = {}) {
  if (!(pOver > 0 && pOver < 1)) {
    throw new Error(`fitNegBinToTail: pOver must be strictly between 0 and 1, got ${pOver}`);
  }
  if (!(r > 0)) throw new Error(`fitNegBinToTail: dispersion must be positive, got ${r}`);

  /* "over 4.5" is "5 or more". Ceil rather than round, and it is the same
     answer for a half line either way; ceil is written because it is also
     right for the whole-number line a provider should never send and
     occasionally does. */
  const atLeast = Math.ceil(line);
  if (atLeast <= 0) throw new Error(`fitNegBinToTail: line ${line} implies no threshold`);

  let lo = 1e-6, hi = 200;
  if (negBinSfAtLeast(atLeast, hi, r) < pOver) {
    throw new Error(`fitNegBinToTail: pOver=${pOver} is unreachable at line=${line}, r=${r}`);
  }
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const p = negBinSfAtLeast(atLeast, mid, r);
    if (Math.abs(p - pOver) < tol) { lo = hi = mid; break; }
    if (p < pOver) lo = mid; else hi = mid;
  }
  const mean = (lo + hi) / 2;
  return {
    kind: 'negbin',
    mean,
    r,
    atLeast,
    sd: Math.sqrt(mean + (mean * mean) / r),
  };
}

/* ---------------------------------------------------------------------------
 * Anytime touchdown
 * ------------------------------------------------------------------------ */

/* The market gives this one directly: an anytime touchdown price de-vigs to a
 * probability of scoring at least once, and that is the whole parameter.
 *
 * IT IS NOT THE EXPECTED NUMBER OF TOUCHDOWNS, and the difference is worth six
 * points. A back priced at 60 percent to score scores 0.6 times per game only
 * if he never scores twice, and backs score twice. So the model is a count
 * whose probability of being zero matches the market, and whose shape supplies
 * the rest: Poisson with lambda = -ln(1 - p) reproduces P(X >= 1) = p exactly
 * and puts a sensible, small amount of mass on two.
 *
 * That is one modelling choice among several and it is written down here
 * rather than buried, because it is the kind of assumption that silently sets
 * the ceiling of every projection this product makes. */
export function tdLambdaFromAnytime(pAnytime) {
  if (!(pAnytime > 0 && pAnytime < 1)) {
    throw new Error(`tdLambdaFromAnytime: need a probability, got ${pAnytime}`);
  }
  return -Math.log(1 - pAnytime);
}

/* ---------------------------------------------------------------------------
 * Sampling
 * ------------------------------------------------------------------------ */

/* A NAMED, SEEDED GENERATOR, because a projection has to be reproducible.
 * Math.random would make every page load a slightly different answer, and a
 * tool whose number moves when you refresh is a tool nobody trusts twice.
 * mulberry32: small, fast, and good enough for Monte Carlo that never claims
 * to be cryptographic. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Box-Muller. Returns one standard normal per call, cached in pairs, because
 * the copula that joins players needs a great many of these. */
export function normalSampler(next) {
  let spare = null;
  return function normal() {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0, s = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const f = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * f;
    return u * f;
  };
}

/* Marsaglia and Tsang. Handles shape < 1 by the standard boost, which is the
 * case a very spread out prior produces and the case a naive implementation
 * gets wrong. */
export function sampleGamma(shape, scale, next) {
  if (shape < 1) {
    const u = next();
    return sampleGamma(1 + shape, scale, next) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  const normal = normalSampler(next);
  for (;;) {
    let x, v;
    do { x = normal(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = next();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

export function samplePoisson(lambda, next) {
  if (lambda <= 0) return 0;
  /* Knuth. Fine here because every lambda in this product is small: an anytime
     touchdown probability of 0.9 is a lambda of 2.3, and the loop runs about
     lambda times. */
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= next(); } while (p > L && k < 1000);
  return k - 1;
}

/* Negative binomial as a gamma-Poisson mixture, which is what it is. Sampling
 * it this way rather than by inverting the CDF means the overdispersion comes
 * from the same place the model says it comes from. */
export function sampleNegBin(mean, r, next) {
  const lambda = sampleGamma(r, mean / r, next);
  return samplePoisson(lambda, next);
}

/* Draw one value from any fit this file produces, so the simulator has one
 * call rather than a switch it has to keep in step with the fitters. */
export function sampleFit(fit, next) {
  if (fit.kind === 'gamma') return sampleGamma(fit.shape, fit.scale, next);
  if (fit.kind === 'negbin') return sampleNegBin(fit.mean, fit.r, next);
  if (fit.kind === 'poisson') return samplePoisson(fit.lambda, next);
  throw new Error(`sampleFit: unknown fit kind "${fit.kind}"`);
}

/* ---------------------------------------------------------------------------
 * Quantiles
 * ------------------------------------------------------------------------ */

/* From a sorted sample. Linear interpolation between order statistics, which
 * is the same convention numpy's default uses, so a number computed here and
 * a number computed in the cold path agree. */
export function quantile(sorted, q) {
  if (!sorted.length) throw new Error('quantile: empty sample');
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[sorted.length - 1];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarize(draws) {
  const s = [...draws].sort((a, b) => a - b);
  const mean = s.reduce((a, x) => a + x, 0) / s.length;
  const varc = s.reduce((a, x) => a + (x - mean) * (x - mean), 0) / Math.max(1, s.length - 1);
  return {
    mean,
    sd: Math.sqrt(varc),
    p10: quantile(s, 0.10),
    p25: quantile(s, 0.25),
    p50: quantile(s, 0.50),
    p75: quantile(s, 0.75),
    p90: quantile(s, 0.90),
  };
}
