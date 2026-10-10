/* Gems: the Arcade Lab's cosmetic currency. They have NO cash value and can
 * never be redeemed for money. Every game pays the same shape: 5 for finishing
 * the daily, plus a bonus by score band (up to 10 more). Practice pays 0.
 *
 * bands: ascending list of { min, bonus }. The highest band whose min the
 * score reaches is the bonus. */
export const GEMS_FOR_DAILY = 5;
export const GEMS_BONUS_MAX = 10;

export function gemsFor(score, bands) {
  let bonus = 0;
  for (const b of bands) if (score >= b.min) bonus = b.bonus;
  return GEMS_FOR_DAILY + Math.min(GEMS_BONUS_MAX, bonus);
}
