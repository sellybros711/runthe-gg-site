/* A hitter's look: skin tone, facial hair, build, jaw guard, his jersey number and his swing.
 * Used by the game (stage.js) and the lab's pack facts (lab/pipeline/extract_lab.mjs).
 *
 * The owner's call (2026-10-31, vault decision std-hitter-looks): a hitter looks like the real
 * player he is in the parts that are data, and the face stays generic.
 *  - number: the jersey number he wore in that game, from MLB Stats API (looks-data.js, written by
 *    pipeline/fetch_looks.mjs from the boxscore, or the team's roster on that date).
 *  - heightIn, weightLb: his listed height and weight (MLB Stats API), so his build is data.
 *  - tone and beard: set by hand from public photos of him in that season, each with its source
 *    note in looks-data.js. No photo is used or stored, only the values.
 *  - the face itself is the one generic head for everybody: no facial features and no likeness.
 * Anything looks-data.js has no value for (null, or a hitter not there) falls back to the hash of
 * his id, the same on every device, as before. jawGuard and swing always come from the hash (no
 * real data yet). The catcher, the umpires and the fielders are not looked up: they stay generic.
 */
import { LOOKS } from './looks-data.js?v=2';

// FNV-1a, then a little mixing: stable across machines
export function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return h >>> 0; }

// the beard mask's strength for each way he wore it (the hash's own three steps)
export const BEARD = { none: 0, stubble: 0.45, full: 0.9 };

/** His look by pack batter id. game: the pack's scenario id, for what he wore that day (number,
    beard); without it only what is the same in every game (tone, build) is looked up. */
export function look(id, game) {
  const h = hash(id), u = (k) => ((h >>> k) & 1023) / 1023;
  const out = {
    tone: +u(0).toFixed(3),                                    // 0 the light skin map .. 1 the dark one
    beard: [0, 0, 0.45, 0.9][(h >>> 10) & 3],                  // none (twice as likely), stubble, full
    jawGuard: ((h >>> 12) % 100) < 35,
    number: String(((h >>> 16) % 79) + 1),
    // which captured swing is his. The third capture (Baseball Hit-3, swing3) is a short one, and the
    // download sent as its full length is the same 118 frames: its hitters take one of the two
    // full swings (Hit, Hit-2) instead, by another bit of the hash, and everyone else keeps his own
    swing: ['swing', 'swing2', ['swing', 'swing2'][h >>> 31]][(h >>> 23) % 3],
  };
  const p = LOOKS.players[id];
  if (p) {
    if (Number.isFinite(p.tone)) out.tone = p.tone;
    // only a known build is handed on: the caller's own (bio.json) or the scene's default stands otherwise
    if (p.heightIn && p.weightLb) { out.heightIn = p.heightIn; out.weightLb = p.weightLb; }
  }
  const g = game && LOOKS.games[game] && LOOKS.games[game].hitters[id];
  if (g) {
    if (g.number != null) out.number = String(g.number);
    if (g.beard in BEARD) out.beard = BEARD[g.beard];
  }
  return out;
}
