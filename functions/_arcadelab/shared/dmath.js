/* Deterministic math for the sims.
 *
 * The browser plays a run and the server replays it, and they must land on
 * the same number to the last bit. + - * / and Math.sqrt are correctly rounded
 * by IEEE 754, so every engine agrees on them. Math.sin, cos, atan2, exp and
 * pow are NOT specified to the last bit: Safari, Chrome and the Workers
 * runtime may differ in the final place, and a chaotic sim (a puck on pegs, a
 * pinball) turns one ulp into a different slot. So the sims use these instead,
 * built from nothing but the operations that are exact.
 */
export const PI = 3.141592653589793;
const TAU = 6.283185307179586, HALF = 1.5707963267948966;

/* sin on [-pi/2, pi/2] by its Taylor series to x^19, error under 1e-15. */
function sinCore(x) {
  const x2 = x * x;
  let t = x, s = x;
  for (let n = 1; n <= 9; n++) { t = -t * x2 / ((2 * n) * (2 * n + 1)); s += t; }
  return s;
}
export function sin(x) {
  x = x - TAU * Math.round(x / TAU);           // [-pi, pi]
  if (x > HALF) x = PI - x; else if (x < -HALF) x = -PI - x;
  return sinCore(x);
}
export function cos(x) { return sin(x + HALF); }

/* atan by two halvings then a series, error under 1e-15 on any input. */
function atanCore(x) {
  // atan(x) = 2 atan(x / (1 + sqrt(1 + x^2))), twice: |x| <= tan(pi/16)
  let k = 1;
  for (let i = 0; i < 2; i++) { x = x / (1 + Math.sqrt(1 + x * x)); k *= 2; }
  const x2 = x * x;
  let t = x, s = x;
  for (let n = 1; n <= 12; n++) { t = -t * x2; s += t / (2 * n + 1); }
  return k * s;
}
export function atan(x) {
  if (x > 1) return HALF - atanCore(1 / x);
  if (x < -1) return -HALF - atanCore(1 / x);
  return atanCore(x);
}
export function atan2(y, x) {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  return y > 0 ? HALF : y < 0 ? -HALF : 0;
}
export function hypot(x, y) { return Math.sqrt(x * x + y * y); }
export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
