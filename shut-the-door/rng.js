/* Shut The Door: the seeded stream.
 *
 * Headless and dependency-free. Browser: window.STD_RNG. Node: require('./rng.js').
 *
 * One mulberry32 stream per outing (CONTRACT.md section 9). Every pitch draws
 * exactly four numbers, in this order: miss x, miss z, the library draw, the
 * runner draw. A pitch that does not need one (a ball needs no runner draw)
 * still takes it, so the stream never depends on what happened, only on how
 * many pitches were thrown. No Math.random, no wall clock.
 */

'use strict';
(function() {

/* Run The Diamond's string hash, so a daily seed reads the same way site wide. */
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The standard normal quantile (Acklam's rational approximation, relative
   error under 1.2e-9). One uniform in, one normal out, so a miss costs one
   draw per axis and the draw order stays fixed. */
const A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
  1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
  6.680131188771972e+01, -1.328068155288572e+01];
const C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
  -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
  3.754408661907416e+00];
function probit(p) {
  p = Math.min(1 - 1e-12, Math.max(1e-12, p));
  const lo = 0.02425, hi = 1 - lo;
  let q, r;
  if (p < lo) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  if (p > hi) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q /
    (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
}

/* The standard normal CDF (Abramowitz and Stegun 7.1.26 through erf; error
   under 1.5e-7). Used to build the miss tables, never to draw. */
function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
    t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/* The four draws of one pitch, in the contract's order. */
function pitchDraws(rng) {
  return { missX: probit(rng()), missZ: probit(rng()), library: rng(), runner: rng() };
}

/* A fresh practice seed. Practice is never stored or submitted, so it may use
   the clock; the daily never comes through here. */
function practiceSeed(now) {
  return hashSeed('practice-' + String(now));
}

const publicAPI = Object.freeze({ hashSeed, mulberry32, probit, normCdf, pitchDraws, practiceSeed });
if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.STD_RNG = publicAPI;
})();
