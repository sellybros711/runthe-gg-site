/* RunTheHouse, seeded randomness.
 *
 * Headless and dependency-free. Browser: window.RH_RNG. Node: require.
 *
 * FOUR NAMED STREAMS, not one. GDD §5. A single shared counter means any player
 * choice, an extra conversation, a comp thrown instead of played, reshuffles
 * every draw after it. That breaks three things at once: a shared seed stops
 * reproducing a house, the simulator stops being able to A/B a weight change
 * against a fixed cast, and regression tests stop being possible at all.
 *
 * So: `gen` builds the cast and never advances again after generation. `comp`
 * resolves competitions. `ai` drives every social decision. `text` picks string
 * fragments. Draws on one stream cannot perturb another.
 *
 * mulberry32 is a deliberate COPY of the one in /gameLogic.js and /football,
 * for the reason engine.js gives over there: gameLogic.js is loaded live by
 * RunThePitch and is not a shared library. Fifteen duplicated lines beat
 * refactoring a running game.
 */

'use strict';

/* xmur3. Turns any string into a well-mixed 32-bit seed. Without this, seeds
   that differ by one character produce first draws that differ by almost
   nothing, which is very visible when the first draw picks a name. */
function hashSeed(str) {
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < String(str).length; i++) {
    h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREAMS = ['gen', 'comp', 'ai', 'text'];

/**
 * Build the four streams from one seed. Each stream is salted with its own name
 * so they do not walk the same sequence offset from each other.
 *
 * `calls` is carried so a run can be serialized mid-week and resumed with every
 * stream exactly where it was. Restoring by replaying N calls is O(n) and n is
 * small; storing the internal state instead would couple the save format to
 * mulberry32's guts.
 */
function createStreams(seed, calls) {
  const streams = {};
  for (const name of STREAMS) {
    const base = hashSeed(`${seed}:${name}`)();
    const raw = mulberry32(base);
    let n = 0;
    const used = (calls && calls[name]) || 0;
    for (let i = 0; i < used; i++) { raw(); n++; }

    const fn = () => { n++; return raw(); };
    fn.calls = () => n;

    /* Every helper below routes through fn(), so the call count stays honest
       no matter which shape the caller reaches for. */
    fn.int = (min, max) => min + Math.floor(fn() * (max - min + 1));
    fn.pick = (arr) => arr[Math.floor(fn() * arr.length)];
    fn.chance = (p) => fn() < p;
    fn.range = (min, max) => min + fn() * (max - min);

    /* Box-Muller, one draw discarded so the call count is deterministic
       whichever branch a caller takes. Clamped at three sigma because an
       unclamped tail on a trust delta is a bug that appears once in ten
       thousand runs and is untraceable when it does. */
    fn.normal = (mean, sd) => {
      const u = 1 - fn();
      const v = fn();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + sd * Math.max(-3, Math.min(3, z));
    };

    /* Fisher-Yates. In place, returns the array. */
    fn.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(fn() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };

    /* Weighted pick. `weights` parallel to `arr`. Negative weights are treated
       as zero rather than throwing, because every caller of this is inside a
       scoring loop where one bad weight should not end the run. */
    fn.weighted = (arr, weights) => {
      let total = 0;
      for (const w of weights) total += Math.max(0, w);
      if (total <= 0) return fn.pick(arr);
      let r = fn() * total;
      for (let i = 0; i < arr.length; i++) {
        r -= Math.max(0, weights[i]);
        if (r <= 0) return arr[i];
      }
      return arr[arr.length - 1];
    };

    streams[name] = fn;
  }
  return streams;
}

/** Snapshot of how far each stream has advanced, for the save blob. */
function streamCalls(streams) {
  const out = {};
  for (const name of STREAMS) out[name] = streams[name].calls();
  return out;
}

/**
 * A seed that reads like something a person would retype. Five digits is 90,000
 * houses, which is more than enough to feel unique and short enough to say out
 * loud, which is the entire point of it being the shareable artifact.
 */
function randomSeed() {
  return String(10000 + Math.floor(Math.random() * 90000));
}

const api = { hashSeed, mulberry32, createStreams, streamCalls, randomSeed, STREAMS };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_RNG = api;
