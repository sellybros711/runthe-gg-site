/* Correlated draws, which is the difference between two projections and an
 * answer.
 *
 * Start/Sit does not ask how many points a player scores. It asks how often
 * one beats another, and that question has no answer without a joint
 * distribution. Two players simulated independently would have their good
 * weeks land at random against each other; in reality a shootout lifts both
 * receivers in it, a game script that buries one back lifts the other, and a
 * quarterback and his top target rise and fall together.
 *
 * Get the correlation wrong and the MEDIANS are still right. Only the
 * probability moves, and the probability is the product.
 *
 *
 * A GAUSSIAN COPULA, WHICH IS A SMALL IDEA WORTH STATING PLAINLY
 * ---------------------------------------------------------------------------
 * The marginals are the things the market told us: a gamma for yardage, a
 * negative binomial for receptions. Those shapes are not negotiable, because
 * each one reproduces a real posted price.
 *
 * So the correlation is applied UNDERNEATH them rather than to them. Draw
 * correlated standard normals, squash each to a uniform through the normal
 * CDF, then push each uniform through its own marginal's inverse CDF. Each
 * variable comes out with exactly the distribution the market implied, and
 * together they carry the correlation structure. Nothing about a player's own
 * projection changes when you put him next to somebody else, which is the
 * property that makes the two halves separately checkable.
 *
 *
 * THE MATRIX IS AN INPUT, NEVER A CONSTANT IN THIS FILE
 * ---------------------------------------------------------------------------
 * The brief is explicit: there is no published academic correlation matrix for
 * NFL fantasy, so anything not estimated in house is folklore. This file
 * therefore knows how to APPLY a matrix and has no opinion about what is in
 * one. The placeholder lives in project.mjs, is named PLACEHOLDER, and is
 * meant to be replaced by fantasy_priors rows the cold path computes from our
 * own play by play.
 */

/* ---------------------------------------------------------------------------
 * Normal CDF and its inverse
 * ------------------------------------------------------------------------ */

/* Hart's rational approximation, accurate to about 1e-15 across the range.
 *
 * THE FIRST VERSION USED Abramowitz and Stegun 7.1.26, which is good to 1.5e-7
 * and is the one everybody reaches for. The note above it said that was far
 * finer than anything downstream could use, and that was wrong in a specific
 * and instructive way: normInv below refines itself with a Halley step that
 * CALLS THIS FUNCTION, so the inverse can never be more accurate than the
 * forward direction. At p = 0.5 the refinement moved the answer 2.5e-7 off
 * zero, which is to say the correction made it worse than the raw
 * approximation it was correcting.
 *
 * A quarter of a millionth is genuinely irrelevant to a projection. It is not
 * irrelevant to a check that asserts an identity, and an identity that has to
 * be loosened to pass is an identity that has stopped guarding anything. */
export function normCdf(x) {
  const z = Math.abs(x);
  let c;
  if (z > 37) {
    c = 0;
  } else {
    const e = Math.exp(-z * z / 2);
    if (z < 7.07106781186547) {
      let b = 3.52624965998911e-02 * z + 0.700383064443688;
      b = b * z + 6.37396220353165;
      b = b * z + 33.912866078383;
      b = b * z + 112.079291497871;
      b = b * z + 221.213596169931;
      b = b * z + 220.206867912376;
      let d = 8.83883476483184e-02 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;
      c = e * b / d;
    } else {
      /* Continued fraction in the far tail, where the rational form above
         loses its footing. */
      let b = z + 0.65;
      b = z + 4 / b;
      b = z + 3 / b;
      b = z + 2 / b;
      b = z + 1 / b;
      c = e / (b * 2.506628274631);
    }
  }
  return x > 0 ? 1 - c : c;
}

/* Acklam's inverse normal, refined by one Halley step. Accurate to about
 * 1e-15 after the refinement, which matters more than the forward direction:
 * this one is used to build the correlation structure, and an error here shows
 * up as a correlation that is quietly not the one asked for. */
export function normInv(p) {
  if (!(p > 0 && p < 1)) throw new Error(`normInv: need 0 < p < 1, got ${p}`);
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const lo = 0.02425, hi = 1 - lo;
  let q, r, x;
  if (p < lo) {
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= hi) {
    q = p - 0.5; r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  /* One Halley refinement. Cheap, and it takes the error from about 1e-9 to
     machine precision. */
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
}

/* ---------------------------------------------------------------------------
 * Cholesky
 * ------------------------------------------------------------------------ */

/* Lower triangular L with A = L L'. Throws on a matrix that is not positive
 * definite, rather than returning NaN, because a NaN here propagates into
 * every draw and the symptom is a table of blank cells that reads as missing
 * data rather than as a broken matrix. */
export function cholesky(A) {
  const n = A.length;
  for (const row of A) {
    if (row.length !== n) throw new Error('cholesky: matrix is not square');
  }
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
      if (i === j) {
        const d = A[i][i] - s;
        if (!(d > 0)) {
          throw new Error(`cholesky: not positive definite at ${i} (pivot ${d})`);
        }
        L[i][j] = Math.sqrt(d);
      } else {
        L[i][j] = (A[i][j] - s) / L[j][j];
      }
    }
  }
  return L;
}

/* A MATRIX ASSEMBLED FROM PARTS IS OFTEN NOT A VALID CORRELATION MATRIX, and
 * this is the trap that makes correlation work fail in production rather than
 * in a test.
 *
 * Each pairwise number can be perfectly reasonable on its own and the set can
 * still be impossible: if A and B correlate 0.9, and B and C correlate 0.9,
 * then A and C cannot correlate -0.9. Nobody notices while writing them down.
 * The estimation the cold path will do can also produce one, from pairs
 * measured over different numbers of games.
 *
 * So this shrinks toward the identity until Cholesky succeeds, and REPORTS how
 * much shrinking it took. Shrinkage toward the identity always reaches a valid
 * matrix, because the identity itself is one. A repaired matrix is not the one
 * asked for, and the caller is entitled to know: a repair of 0.02 is rounding,
 * a repair of 0.4 means the inputs disagree with each other badly enough to
 * look at. */
export function safeCholesky(A, { maxShrink = 0.99 } = {}) {
  try {
    return { L: cholesky(A), shrink: 0 };
  } catch (e) { /* fall through to repair */ }

  const n = A.length;
  for (let s = 0.01; s <= maxShrink; s = s < 0.1 ? s + 0.01 : s * 1.5) {
    const B = A.map((row, i) => row.map((v, j) => (i === j ? v : v * (1 - s))));
    try {
      return { L: cholesky(B), shrink: s };
    } catch (e) { /* keep shrinking */ }
  }
  throw new Error('safeCholesky: no amount of shrinking made this matrix valid. '
    + 'Check the diagonal: a correlation matrix has 1 down it.');
}

/* ---------------------------------------------------------------------------
 * Drawing
 * ------------------------------------------------------------------------ */

/* One vector of correlated standard normals. L z, where z is independent
 * standard normals. */
export function correlatedNormals(L, normal) {
  const n = L.length;
  const z = new Array(n);
  for (let i = 0; i < n; i++) z[i] = normal();
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k <= i; k++) s += L[i][k] * z[k];
    out[i] = s;
  }
  return out;
}

/* One vector of correlated UNIFORMS, which is what a marginal's inverse CDF
 * wants.
 *
 * Clamped away from 0 and 1. normCdf can return exactly 1 for a large draw in
 * floating point, and an inverse CDF asked for the 100th percentile of an
 * unbounded distribution does not return. The clamp is at 1e-12, which is
 * finer than 10,000 draws can resolve, so it costs nothing real. */
export function correlatedUniforms(L, normal) {
  return correlatedNormals(L, normal)
    .map((z) => Math.min(1 - 1e-12, Math.max(1e-12, normCdf(z))));
}

/* ---------------------------------------------------------------------------
 * Inverse CDFs for the marginals dist.mjs fits
 * ------------------------------------------------------------------------ */

/* Bisection, because the gamma quantile has no closed form and a bad
 * approximation here would quietly distort the tail, which is exactly where a
 * boom week lives. 200 iterations of bisection on a bracket that doubles is
 * far more than enough and still microseconds. */
export function invGammaCdf(p, shape, scale, cdf) {
  if (!(p > 0 && p < 1)) throw new Error(`invGammaCdf: need 0 < p < 1, got ${p}`);
  let hi = shape * scale;
  let guard = 0;
  while (cdf(hi, shape, scale) < p) {
    hi *= 2;
    if (++guard > 200) throw new Error('invGammaCdf: could not bracket');
  }
  let lo = 0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid, shape, scale) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* A count, so this walks the mass function rather than inverting anything.
 * Exact, and the loop is short because nobody catches forty passes. */
export function invDiscreteCdf(p, pmf, { cap = 300 } = {}) {
  let acc = 0;
  for (let k = 0; k <= cap; k++) {
    acc += pmf(k);
    if (p <= acc) return k;
  }
  return cap;
}

/* ---------------------------------------------------------------------------
 * Measuring what came out
 * ------------------------------------------------------------------------ */

/* Pearson correlation of two samples. Used by the checks to assert that the
 * draws carry the correlation that was asked for, which is the only way to
 * know the copula is wired up the right way round. */
export function corr(xs, ys) {
  const n = xs.length;
  if (n !== ys.length || n < 2) throw new Error('corr: need two equal, non-trivial samples');
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}
