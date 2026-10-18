/* A hitter's look, from his id alone: skin tone, facial hair, jaw guard and a generic number. Never
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
  };
}
