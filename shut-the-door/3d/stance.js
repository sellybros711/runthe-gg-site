/* Where a hitter stands (rules 12, contract.js hbpReachAt). people.js stands the league's average
 * hitter with his feet inplay-plan.js STANCE_X off the plate's centre: his hips' midpoint STANCE_IN
 * inches off the plate's inside edge a second before the release, Statcast's batting stance. A hitter
 * with a real stance (the pack's stanceIn, Statcast's distance off the plate, pipeline/stance.mjs)
 * stands as much nearer or further, and the reach moves with him (contract.js HBP.STANCE_IN is this
 * STANCE_IN). Anyone else stands where the average hitter does. */
export const STANCE_IN = 28;
/** How much further off the plate than the average hitter he stands, feet (0 with no stance). */
export const stanceOff = (b) => (b && b.stanceIn != null ? b.stanceIn - STANCE_IN : 0) / 12;
