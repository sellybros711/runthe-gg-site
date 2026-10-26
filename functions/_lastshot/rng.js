/* Seeds and the one random source. Nothing in the sim may call Math.random:
 * the same seed and the same play have to give the same result, on any
 * device, so a player's "this happened" can be replayed exactly.
 * (Copied from functions/_arcadelab/shared/seed.js so this game stands alone.) */
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A fresh seed for a new run. The browser asks crypto; the sim never does. */
export function freshSeed() {
  const b = new Uint32Array(1);
  (globalThis.crypto || { getRandomValues: a => { a[0] = Date.now() >>> 0; return a; } }).getRandomValues(b);
  return b[0] >>> 0;
}
