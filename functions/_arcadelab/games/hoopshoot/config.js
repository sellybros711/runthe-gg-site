/* Hoop Shoot: every feel-tuning number in ONE place.
 * Units are feet; x is left to right, y is away from the shooter, z is up.
 * Time is fixed-step frames of 1/60 s with SUB physics sub-steps each. */
export const CONFIG = Object.freeze({
  GAME_ID: 'hoop-shoot',
  DT: 1 / 60,
  SUB: 4,
  CLOCK_FRAMES: 60 * 60,        // 60 seconds; a ball in the air at the horn still counts
  STILL_FRAMES: 60 * 20,        // the hoop holds still for the first 20 seconds
  RELOAD_FRAMES: 22,            // the rack feeds the next ball this soon
  BALL_LIFE: 60 * 3,            // a ball is dead after three seconds whatever it did

  /* The shot. Release from (0, 0, RELEASE_Z) at a fixed arc. */
  RELEASE_Z: 7,
  ELEVATION: 0.92,              // radians above flat, about 53 degrees
  V_MIN: 20,                    // ft/s at power 0
  V_MAX: 31,                    // ft/s at power 1
  MAX_AIM: 0.32,                // radians either side
  GRAVITY: 32.2,

  /* The goal. */
  HOOP_Y: 15,
  RIM_Z: 10,
  RIM_R: 0.75,                  // a real rim is 18 inches across
  BALL_R: 0.39,
  BOARD_GAP: 0.5,               // from the back of the rim to the glass
  BOARD_HALF: 3,
  BOARD_LO: 9.5, BOARD_HI: 13.5,
  RIM_E: 0.42,                  // restitution off the rim
  RIM_KEEP: 0.78,               // share of the tangential speed kept off the rim
  BOARD_E: 0.6,
  /* Near the rim on the way down, a small seeded pull toward the middle, so
     a shot that was nearly perfect goes in. */
  MAGNET: 3.0,                  // ft/s^2 at full strength

  /* The hoop moves after the still spell: a seeded sine or a back-and-forth. */
  MOVE_AMP: [1.2, 2.6],
  MOVE_PERIOD: [150, 300],      // frames

  /* Scoring. */
  BASKET: 2, SWISH: 3, MONEY_EVERY: 5, MONEY_MULT: 2, FIRE_AFTER: 4, FIRE_SHOTS: 3, FIRE_BONUS: 1,
  BLOCKS: 10,                   // the share strip: makes per six-second block
  GEM_BANDS: Object.freeze([{ min: 0, bonus: 0 }, { min: 30, bonus: 3 }, { min: 55, bonus: 6 }, { min: 80, bonus: 10 }]),

  MAX_INPUTS: 400,
  MAX_FRAMES: 60 * 60 + 60 * 4
});
