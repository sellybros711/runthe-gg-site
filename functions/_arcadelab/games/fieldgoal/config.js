/* Field Goal Flick: every feel-tuning number in ONE place.
 * Units are yards and miles per hour; time is fixed-step frames of 1/60 s. */
export const CONFIG = Object.freeze({
  GAME_ID: 'field-goal-flick',
  DT: 1 / 60,
  KICKS: 5,

  /* The day: five distances that climb and winds that stiffen. One range per
     kick; the seed picks a value inside each. */
  DISTANCES: Object.freeze([[22, 28], [30, 36], [38, 43], [44, 49], [50, 55]]),
  WIND_MPH: Object.freeze([[0, 4], [3, 7], [5, 10], [7, 13], [9, 16]]),
  /* The share of the wind that blows down the field (head or tail). */
  WIND_ALONG: 0.35,

  /* The kick. Power 0..1 sets the range the ball would carry in still air;
     the aim is radians off the middle of the uprights. */
  RANGE_MIN: 20,                // yards at power 0
  RANGE_MAX: 74,                // yards at power 1
  MAX_AIM: 0.30,                // radians either side
  PEAK: 13,                     // apex height of a full flight, yards
  OVERHIT: 0.88,                // past this power a kick starts to spray
  OVERHIT_SPRAY: 0.06,          // extra radians of seeded spray at power 1

  /* The wind. Drift in yards = mph * WIND_DRIFT * (distance / 40)^2. */
  WIND_DRIFT: 0.30,
  WIND_RANGE: 0.010,            // range lost per mph of headwind (gained with a tail)

  /* Seeded jitter per kick, so a kick is a little alive but never a lottery. */
  AIM_JITTER: 0.004,
  RANGE_JITTER: 0.012,

  /* The goal. NFL uprights are 18 ft 6 in apart; the bar is 10 ft up. */
  HALF_WIDTH: 3.083,
  BAR: 3.333,
  BALL_R: 0.15,
  /* A ball this close to a post or the bar hits it: a DOINK, settled by the
     kick's own seeded draw. */
  DOINK: 0.25,
  DOINK_IN: 0.5,                // chance a doink falls the right way

  FLIGHT_FRAMES: 66,            // airtime on screen
  SETTLE_FRAMES: 75,            // the call stays up this long

  /* Scoring. A good kick is 3 plus 1 per 10 yards; a doink that goes in is +1;
     from the third good kick in a row each is +1 more. */
  GOOD: 3, PER_TEN: 1, DOINK_BONUS: 1, STREAK_FROM: 3, STREAK_BONUS: 1,

  /* Gems bonus by the share of the day's maximum. */
  GEM_SHARE_BANDS: Object.freeze([{ at: 0, bonus: 0 }, { at: 0.35, bonus: 3 }, { at: 0.6, bonus: 6 }, { at: 0.85, bonus: 10 }]),

  MAX_FRAMES: 60 * 60 * 20
});
