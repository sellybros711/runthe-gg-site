/* Taking the bookmaker's margin out of a price.
 *
 * A sportsbook's two prices on a market do not add up to 100 percent. They add
 * up to something like 104 to 109, and the surplus is the margin. Every
 * projection in this product starts by removing it, because the number we want
 * is what the market thinks will happen, not what it is charging to bet on it.
 *
 * Get this wrong and NOTHING LOOKS WRONG. A projection built on a 52 percent
 * probability that should have been 50 is a plausible number sitting in a
 * plausible table. It is off by the size of the vig, in the same direction,
 * on every player, all season. That is why this file is small, pure, and has
 * more tests than code.
 *
 *
 * TWO METHODS, BOTH KEPT, AND THE ROW RECORDS WHICH ONE
 * ---------------------------------------------------------------------------
 * The brief asks for multiplicative and Shin, the active one configurable, and
 * the method recorded per row. fantasy_projections.devig_method is that
 * column.
 *
 * They disagree, and they disagree most exactly where it matters. Splitting
 * the margin proportionally is the obvious thing and it assumes the book
 * applies it evenly. Shin's model assumes the book is defending against people
 * who know something, which makes it shade the unlikely side harder. On a
 * 50/50 receiving yards line the two agree to within a rounding error. On an
 * anytime touchdown price at +450 they do not, and that is a market this
 * product reads on every player.
 *
 * Neither is "correct". They are two models of the same unobservable, so the
 * honest thing is to keep both, be able to switch, and know which one produced
 * a number you are looking at.
 */

/* ---------------------------------------------------------------------------
 * American odds
 * ------------------------------------------------------------------------ */

/* The implied probability of a single American price, before any margin is
 * removed. This is the one piece of arithmetic in the file that everybody
 * thinks they remember and half get backwards, so both branches are asserted
 * against hand-computed values in check-math.mjs.
 *
 *   +150  ->  100 / 250      = 0.4000
 *   -150  ->  150 / 250      = 0.6000
 *   -110  ->  110 / 210      = 0.5238
 *
 * THERE IS NO SUCH PRICE AS 0, and American odds between -100 and +100 do not
 * exist either: the convention has a discontinuity there, with -100 and +100
 * both meaning evens. A price inside that gap is a provider bug or a parsing
 * bug, and returning a plausible number for it would bury the bug in a
 * projection. So it throws. */
export function americanToProb(price) {
  const n = Number(price);
  if (!Number.isFinite(n)) throw new Error(`americanToProb: not a number: ${price}`);
  if (n >= 100) return 100 / (n + 100);
  if (n <= -100) return -n / (-n + 100);
  throw new Error(`americanToProb: ${n} is not a valid American price `
    + '(nothing lies strictly between -100 and +100)');
}

/* The inverse, for writing a fair price back out. Rounds to the nearest whole
 * number the way a book quotes, and never returns something in the forbidden
 * band: a fair probability near 0.5 maps to -100 or +100 rather than to 0. */
export function probToAmerican(p) {
  if (!(p > 0 && p < 1)) throw new Error(`probToAmerican: ${p} is not a probability`);
  if (p >= 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

/* How much margin is in a set of prices. 1.0 is a fair book. 1.045 is a
 * typical two-way NFL yardage market at -110 both sides.
 *
 * Kept as its own function because it is the thing worth STORING and worth
 * showing: a market whose overround suddenly doubles is a market the book has
 * stopped being confident about, and that is information about the player. */
export function overround(prices) {
  return prices.reduce((s, x) => s + americanToProb(x), 0);
}

/* ---------------------------------------------------------------------------
 * Multiplicative
 * ------------------------------------------------------------------------ */

/* Divide out the surplus proportionally. The simplest possible answer, and the
 * right default: it makes no claim about WHY the margin is there, which is a
 * claim Shin does make and might be wrong about.
 *
 * Returns fair probabilities in the order given, summing to 1. */
export function devigMultiplicative(prices) {
  const raw = prices.map(americanToProb);
  const b = raw.reduce((s, x) => s + x, 0);
  if (!(b > 0)) throw new Error('devigMultiplicative: prices imply zero total probability');
  return raw.map((x) => x / b);
}

/* ---------------------------------------------------------------------------
 * Shin
 * ------------------------------------------------------------------------ */

/* Shin (1993) models the book as quoting against a proportion z of traders who
 * know the outcome. Under it, the fair probability behind an observed price is
 *
 *   q_i = [ sqrt( z^2 + 4(1-z) p_i^2 / B ) - z ] / ( 2 (1-z) )
 *
 * where p_i are the raw implied probabilities and B is their sum. z is the one
 * free parameter and it is pinned by the requirement that the q_i sum to 1.
 *
 * SOLVED NUMERICALLY RATHER THAN IN CLOSED FORM, deliberately. A closed form
 * exists for the two-outcome case, and writing it from memory is exactly the
 * kind of thing that is subtly wrong and produces plausible numbers for ever.
 * Bisection on a function that is monotone in z is a dozen lines, is obviously
 * right, works for any number of outcomes, and costs microseconds. The
 * assertion that the answer sums to 1 is then a real check rather than a
 * restatement of the algebra.
 *
 * The bracket is [0, 1): at z = 0 the map gives sum sqrt(B), which is above 1
 * for any book with margin in it, and the sum falls as z rises. So a root
 * exists whenever B > 1, which is every real market. */
export function devigShin(prices, { maxIter = 100, tol = 1e-12 } = {}) {
  const raw = prices.map(americanToProb);
  const b = raw.reduce((s, x) => s + x, 0);
  if (!(b > 0)) throw new Error('devigShin: prices imply zero total probability');

  /* A book with no margin at all (or one quoted at a loss) has nothing for
     Shin to remove, and the formula's bracket does not contain a root. Fall
     through to the proportional answer, which for B <= 1 is the same thing
     anybody would want. Real markets never land here; a hand-built fixture
     does, and silently returning NaN for it would be the worse failure. */
  if (b <= 1) return devigMultiplicative(prices);

  const qs = (z) => raw.map((p) =>
    (Math.sqrt(z * z + 4 * (1 - z) * p * p / b) - z) / (2 * (1 - z)));
  const sumAt = (z) => qs(z).reduce((s, x) => s + x, 0);

  let lo = 0, hi = 1 - 1e-9;
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const s = sumAt(mid);
    if (Math.abs(s - 1) < tol) { lo = hi = mid; break; }
    if (s > 1) lo = mid; else hi = mid;
  }
  const z = (lo + hi) / 2;
  const out = qs(z);

  /* Renormalize the last rounding away. The bisection lands within 1e-12 and
     the caller is entitled to a vector that sums to exactly 1, because the
     next thing that happens to these numbers is that they get multiplied
     together. */
  const s = out.reduce((a, x) => a + x, 0);
  return out.map((x) => x / s);
}

/* The insider fraction itself. Not used by the projection, and worth having:
 * it is the parameter the model is built on, so a z that comes back at 0.4 is
 * either a very strange market or a bug in the prices feeding it. */
export function shinZ(prices) {
  const raw = prices.map(americanToProb);
  const b = raw.reduce((s, x) => s + x, 0);
  if (b <= 1) return 0;
  const sumAt = (z) => raw.reduce((s, p) =>
    s + (Math.sqrt(z * z + 4 * (1 - z) * p * p / b) - z) / (2 * (1 - z)), 0);
  let lo = 0, hi = 1 - 1e-9;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (sumAt(mid) > 1) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ---------------------------------------------------------------------------
 * The one the pipeline calls
 * ------------------------------------------------------------------------ */

export const DEVIG_METHODS = ['multiplicative', 'shin'];

/* WHICH METHOD IS ACTIVE IS A DEPLOY, NOT A GUESS AT THE CALL SITE. Every
 * caller passes it through from one place so a whole run is one method, and
 * the method is written onto the row. A default that each caller could
 * override is the same argument with a politer name. */
export const DEVIG_DEFAULT = 'multiplicative';

export function devig(prices, method = DEVIG_DEFAULT) {
  if (method === 'multiplicative') return devigMultiplicative(prices);
  if (method === 'shin') return devigShin(prices);
  throw new Error(`devig: unknown method "${method}". Known: ${DEVIG_METHODS.join(', ')}`);
}

/* A two-way market, which is nearly all of them, with the answer named rather
 * than returned as a bare pair. `over` and `under` read at the call site;
 * `[0]` and `[1]` do not, and getting them the wrong way round is a silent
 * sign error on every projection built from that market. */
export function devigTwoWay(overPrice, underPrice, method = DEVIG_DEFAULT) {
  const [over, under] = devig([overPrice, underPrice], method);
  return { over, under, overround: overround([overPrice, underPrice]), method };
}
