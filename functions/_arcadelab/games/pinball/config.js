/* Pinball: every feel-tuning number in ONE place.
 * Units are table units: 100 wide, 186 tall, y grows DOWN the table toward
 * the flippers. Time is fixed-step frames of 1/60 s with SUB sub-steps each.
 *
 * FEEL, in order of how much it matters:
 *   FLIP_SPEED     how hard a flip hits. Too low and nothing reaches the top.
 *   FLIP_E         how lively the ball comes off a flipper.
 *   GRAVITY        the table's tilt. Lower is floatier and easier.
 *   BALL_DAMP      air and table friction per second.
 *   BUMPER_KICK    how wild the pops are.
 */
export const CONFIG = Object.freeze({
  GAME_ID: 'pinball',
  DT: 1 / 60,
  SUB: 6,
  BALLS: 3,

  GRAVITY: 170,                 // units/s^2 down the table
  BALL_R: 2.4,
  MAX_SPEED: 280,               // per sub-step that is under a third of the ball: no tunnelling
  BALL_DAMP: 0.06,              // share of speed lost per second

  /* Flippers. Angles in radians, y down: positive points down the table. */
  FLIP_LEN: 15,
  FLIP_R: 1.9,
  FLIP_REST: 0.50,              // resting, tip down
  FLIP_UP: -0.42,               // raised
  FLIP_SPEED: 26,               // rad/s while moving
  FLIP_E: 0.32,
  LEFT_PIVOT: [29, 160], RIGHT_PIVOT: [67, 160],  // the gap between the tips at rest is wider than the ball

  WALL_E: 0.45,
  WALL_R: 0.9,

  /* The shooter lane and the plunger. */
  LANE_X: 93, LANE_REST_Y: 172,
  PLUNGE_MIN: 235, PLUNGE_MAX: 300,  // the weakest pull still clears the lane

  /* Toys. */
  BUMPERS: Object.freeze([[37, 50], [61, 50], [49, 70]]),
  BUMPER_R: 6,
  BUMPER_KICK: 115,
  SLING_KICK: 105,
  LANES: Object.freeze([30, 48, 66]),       // 1B, 2B, 3B rollovers
  LANE_Y: [11, 22],
  RAMP_IN: Object.freeze({ x0: 6, x1: 17, y0: 56, y1: 62, minUp: 55 }),
  RAMP_FRAMES: 50,
  RAMP_OUT: Object.freeze({ x: 24, y: 100, vx: 12, vy: 40 }),
  TARGETS_X: 84,
  TARGETS: Object.freeze([[70, 77], [80, 87], [90, 97]]),
  TARGET_RESET_FRAMES: 120,

  /* Rules. */
  BALL_SAVE_FRAMES: 8 * 60,
  NUDGES_PER_BALL: 2,           // the third nudge on a ball is a TILT
  NUDGE_UP: 40, NUDGE_SIDE: 16,
  STUCK_SPEED: 9,
  STUCK_PULSE_FRAMES: 4 * 60,   // a ball this slow this long gets a search pulse
  STUCK_PULSE2_FRAMES: 5 * 60,
  STUCK_RESCUE_FRAMES: 5.75 * 60, // and is put back in play before six seconds

  /* Scoring. */
  PTS: Object.freeze({ bumper: 100, hot: 5, sling: 50, lane: 250, allBases: 5000, ramp: 1000, target: 500, bank: 3000, laneEnd: 250 }),
  MULT_MAX: 5,

  /* Gems: bands of the score. Placeholders until testers have played; then
     set the top band at about the 90th percentile of tester scores. */
  GEM_BANDS: Object.freeze([{ min: 0, bonus: 0 }, { min: 15000, bonus: 3 }, { min: 40000, bonus: 6 }, { min: 80000, bonus: 10 }]),

  MAX_INPUTS: 6000,
  MAX_FRAMES: 60 * 60 * 20
});
