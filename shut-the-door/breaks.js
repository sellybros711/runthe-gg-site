/* Shut The Door: which way a pitch moves, for the break arrows on the aim and the pitch guide's words.
 *
 * Only the 2D screens read this. The flight (3d/pitch.js) and the engine never do, so nothing here
 * moves a pitch: it ends on the same point, at the same time, out of the same delivery.
 *
 * Numbers are Statcast's: pfxX and pfxZ in inches from the catcher's view (x toward first base, so a
 * righty's arm side is x < 0 and a lefty's x > 0), the spin's push over the whole flight against the
 * same pitch with no spin (pfxZ is induced, gravity not in it). The sign of pfxX is already the
 * pitcher's own: nothing here flips by hand. The only mirror is the screen's (screenU, from aim.js
 * SCREEN_U, which reads contract.js screenCol()).
 *
 * THE BREAK ARROWS (the owner, 2026-11-03; the frame fixed 2026-11-10). The way is what the hitter
 * sees, so it is measured against the pitch he is sitting on, with gravity at each pitch's own speed:
 *
 *   - A fastball (four-seam, sinker) is measured against the league's average four-seam: up and down
 *     against its path (BRK_REF), sideways its own run (pfxX). A riding four-seam reads flat or up and
 *     runs arm side; a sinker runs and sinks.
 *   - Any other pitch is measured against his own fastball (the four-seam or sinker he throws most),
 *     both ways: how far it ends from where that fastball would. With no fastball in his arsenal,
 *     the league's average four-seam (BRK_REF, BRK_REF_X), both ways.
 *
 * Before 2026-11-10 the other pitches took the vertical against the four-seam but the sideways against
 * no spin, so the four-seam's own arm side run (7.3 inches) was left out and every breaking ball read
 * too vertical (Lidge's slider 3 degrees off straight down, Sewald's sweeper 37; now 21 and 64), and a
 * cutter with a touch of arm side pfx (Devin Williams, -0.8) pointed arm side.
 *
 * Measured on every arsenal row in the 30 packs (90 rows, 2026-11-10): the average four-seam's pfxZ less
 * the drop is -12.4 inches and its pfxX 7.3 inches to the arm side; the thirds of the arrows' size fall
 * at 12.7 and 20.4 inches, so under 13 is one chevron, 13 to 20 two, 20 and over three.
 */
(function (root) {
  'use strict';
  var BRK_REF = -12.4, BRK_REF_X = 7.3, BRK_TWO = 13, BRK_THREE = 20;
  var FASTBALL = { FF: true, SI: true };
  /* the drop gravity adds over the last 50 feet at 95% of his release speed, in inches */
  function gravityDrop(velo) { var t = 50 / (0.95 * velo * 1.4667); return 0.5 * 32.174 * t * t * 12; }
  function ok(a) { return !!a && a.pfxX != null && a.pfxZ != null && !!a.velo; }
  /* the fastball the hitter sits on: the four-seam or sinker he throws most, or null */
  function fastballOf(arsenal) {
    var best = null;
    (arsenal || []).forEach(function (a) { if (FASTBALL[a.type] && ok(a) && (!best || a.usage > best.usage)) best = a; });
    return best;
  }
  /* The movement the arrows draw, in inches, catcher's view: { x, z } (x toward first base, z up), or
     null without numbers. throws is 'R' or 'L' (only for the fallback with no fastball). */
  function move(a, arsenal, throws) {
    if (!ok(a)) return null;
    var z0 = a.pfxZ - gravityDrop(a.velo);
    if (FASTBALL[a.type]) return { x: a.pfxX, z: z0 - BRK_REF };
    var fb = fastballOf(arsenal);
    if (fb) return { x: a.pfxX - fb.pfxX, z: z0 - (fb.pfxZ - gravityDrop(fb.velo)) };
    var arm = throws === 'L' ? 1 : -1;
    return { x: a.pfxX - arm * BRK_REF_X, z: z0 - BRK_REF };
  }
  /* The arrows: { dx, dy, n }, a unit direction on screen (y down; screenU +1 unmirrored, -1 the
     pitcher's view) and 1 to 3 chevrons by size, or null. */
  function arrows(a, arsenal, throws, screenU) {
    var m = move(a, arsenal, throws);
    if (!m) return null;
    var mag = Math.sqrt(m.x * m.x + m.z * m.z);
    if (mag < 0.5) return null;
    return { dx: m.x * (screenU || 1) / mag, dy: -m.z / mag, n: mag >= BRK_THREE ? 3 : mag >= BRK_TWO ? 2 : 1 };
  }
  /* Sideways for this hitter, from his own pfxX: 'in' toward him, else 'away' (the guide's words
     against no spin). A righty stands on the catcher's left, the negative pfxX side. */
  function side(pfxX, bats) {
    return (bats === 'L' ? pfxX > 0 : pfxX < 0) ? 'in' : 'away';
  }
  var api = { arrows: arrows, move: move, side: side, fastballOf: fastballOf, gravityDrop: gravityDrop,
    BRK_REF: BRK_REF, BRK_REF_X: BRK_REF_X, BRK_TWO: BRK_TWO, BRK_THREE: BRK_THREE, FASTBALL: FASTBALL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.STD_BREAK = api;
})(typeof window !== 'undefined' ? window : null);
