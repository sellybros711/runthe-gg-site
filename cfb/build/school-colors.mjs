/* Schools whose CFBD colours are not the colours the school actually plays in.
 *
 * CFBD's palette is right for most of the 83 schools in this game and wrong for a
 * handful, in three ways that are worth naming because they are the three to look
 * for when a new school is added:
 *
 *   THE WRONG SHADE. Ohio State's scarlet is #BB0000; CFBD has #ce1141, which is a
 *   raspberry. Texas plays in burnt orange #BF5700; CFBD has #c15d26, which reads
 *   brown. Both are close enough to pass a glance and wrong enough to look off next
 *   to the real thing.
 *
 *   THE PAIR THE WRONG WAY ROUND. Oregon State is an orange team with black trim and
 *   CFBD has it as a black team with orange trim, so the reel drew Oregon State as a
 *   black box.
 *
 *   A SECONDARY THAT IS NOT THE SECONDARY. Pittsburgh's is gold, not the near-black
 *   CFBD lists. Western Michigan's is gold, not grey. Northern Illinois has a second
 *   red where the black should be.
 *
 * Every value here is the school's own published primary and secondary. Anything not
 * in this map keeps what CFBD says, which is the right default: this is a list of
 * exceptions, not a second source of truth.
 *
 * Imported by 02-teams.mjs so a rebuild keeps the corrections, and applied to the
 * built file by recolor.mjs so the current data gets them without a rebuild.
 */
export const SCHOOL_COLORS = {
  /* Scarlet, not raspberry. */
  'Ohio State':        { color: '#bb0000', alt_color: '#666666' },
  /* Burnt orange, not brown. */
  'Texas':             { color: '#bf5700', alt_color: '#ffffff' },
  /* An orange team with black trim, which CFBD has the wrong way round. */
  'Oregon State':      { color: '#dc4405', alt_color: '#000000' },
  /* Pitt's secondary is gold. */
  'Pittsburgh':        { color: '#003594', alt_color: '#ffb81c' },
  /* Cardinal and black. CFBD's secondary is a second, darker red. */
  'Northern Illinois': { color: '#f1122c', alt_color: '#000000' },
  /* Brown and gold. CFBD's secondary is a warm grey. */
  'Western Michigan':  { color: '#532e1f', alt_color: '#b5a167' },
  /* Berkeley Blue. CFBD's is so dark it renders as black. */
  'California':        { color: '#003262', alt_color: '#fdb515' },
  /* Oregon's green is a dark forest, not the bright green CFBD lists. */
  'Oregon':            { color: '#154733', alt_color: '#fee123' },
  /* BYU plays in navy, not royal. */
  'BYU':               { color: '#002e5d', alt_color: '#ffffff' },
  /* Duke Blue is a medium blue. */
  'Duke':              { color: '#00539b', alt_color: '#ffffff' },
};

/* Returns the pair to use for a school: the correction if there is one, otherwise
   whatever was passed in. Written to take and return the same shape either way, so a
   caller never has to ask whether an override existed. */
export function correctColors(school, color, altColor) {
  const fix = SCHOOL_COLORS[school];
  if (!fix) return { color, alt_color: altColor };
  return { color: fix.color, alt_color: fix.alt_color };
}
