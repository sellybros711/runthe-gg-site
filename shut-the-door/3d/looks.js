/* A hitter's look, from his id alone: skin tone, facial hair, jaw guard, a generic number and his
 * swing (one of the two full captures). Never
 * his real look or number (no likeness): a hash spreads the looks across the roster, the same on
 * every device. Used by the game (stage.js) and the lab's pack facts (lab/pipeline/extract_lab.mjs).
 */
// FNV-1a, then a little mixing: stable across machines
export function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return h >>> 0; }

export function look(id) {
  const h = hash(id), u = (k) => ((h >>> k) & 1023) / 1023;
  return {
    tone: +u(0).toFixed(3),                                    // 0 the light skin map .. 1 the dark one
    beard: [0, 0, 0.45, 0.9][(h >>> 10) & 3],                  // none (twice as likely), stubble, full
    jawGuard: ((h >>> 12) % 100) < 35,
    number: String(((h >>> 16) % 79) + 1),
    // which captured swing is his. The third capture (Baseball Hit-3, swing3) is a short one, and the
    // download sent as its full length is the same 118 frames: its hitters take one of the two
    // full swings (Hit, Hit-2) instead, by another bit of the hash, and everyone else keeps his own
    swing: ['swing', 'swing2', ['swing', 'swing2'][h >>> 31]][(h >>> 23) % 3],
  };
}
