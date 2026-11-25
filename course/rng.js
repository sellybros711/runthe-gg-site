/* Run The Course: the seeded generator and the only maths the sim may use.
 *
 * DETERMINISM IS THE RULE. The same seed, config and command log must give
 * the same shift in Node, on the server and in every browser, because the
 * server re-runs a filed shift. JavaScript engines may disagree in the last
 * bit of Math.sin, Math.log, Math.pow and friends, so nothing in the sim
 * calls them. It uses + - * / and Math.sqrt (exact everywhere), a normal
 * made of summed uniforms, and headings from a table of literals.
 * test/sim.test.mjs reads the sim's source and fails on a forbidden call.
 *
 * The generator's whole state is one integer, kept in the game state, so a
 * saved shift carries it. */
export function rngNext(S) {
  let t = (S.rng = (S.rng + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/* A standard normal: six uniforms summed have mean 3 and variance 1/2. */
const ROOT2 = 1.4142135623730951;
export function rngNormal(S) {
  return (rngNext(S) + rngNext(S) + rngNext(S) + rngNext(S) + rngNext(S) + rngNext(S) - 3) * ROOT2;
}
export function rngPick(S, odds) {
  let r = rngNext(S), last = null;
  for (const k in odds) { last = k; r -= odds[k]; if (r < 0) return k; }
  return last;
}
/* A seed for shift n of a course: a small integer mix, no floats. */
export function mixSeed(a, b) {
  let h = (a | 0) ^ Math.imul((b | 0) + 0x9E3779B9, 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 16), 0x45D9F3B);
  h = Math.imul(h ^ (h >>> 16), 0x45D9F3B);
  return (h ^ (h >>> 16)) | 0;
}
/* Sixteen headings, east first, counter clockwise. Literals, not Math.cos. */
const C1 = 0.9238795325112867, S1 = 0.3826834323650898, D = 0.7071067811865476;
export const HEADINGS = Object.freeze([[1, 0], [C1, S1], [D, D], [S1, C1], [0, 1], [-S1, C1], [-D, D], [-C1, S1],
  [-1, 0], [-C1, -S1], [-D, -D], [-S1, -C1], [0, -1], [S1, -C1], [D, -D], [C1, -S1]]);
export const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/* FNV-1a over a string, as 8 hex digits: the checksum of a shift's result. */
export function checksum(str) {
  let h = 0x811C9DC5 | 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}
