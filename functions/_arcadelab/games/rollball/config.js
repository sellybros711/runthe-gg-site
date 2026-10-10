/* Roll-Ball: every feel-tuning number in ONE place.
 *
 * World units are centimetres-ish on a top-down lane. x runs left to right,
 * 0 is the middle of the lane. y runs away from the player: the ball starts at
 * y 0, the ramp lip is at LIP_Y, the target board sits beyond it.
 * Time is fixed-step frames of 1/60 s. Nothing reads the wall clock.
 */
export const CONFIG = Object.freeze({
  GAME_ID: 'roll-ball',
  NAME: 'Roll-Ball',
  DT: 1 / 60,
  BALLS: 9,
  MAX_BASES: 4,                // a ball never scores more than a home run

  /* The throw. Power 0..1 maps linearly to launch speed. */
  V_MIN: 120,                  // units/s at power 0
  V_MAX: 330,                  // units/s at power 1
  MAX_ANGLE: 0.42,             // radians either side of straight up the lane

  /* The lane. */
  LANE_HALF: 28,               // half width of the lane between its rails
  LANE_FRICTION: 55,           // deceleration on the lane, units/s^2
  WALL_E: 0.55,                // speed kept across a rail bounce
  LIP_Y: 170,                  // the ramp lip; past it the ball is airborne
  MIN_LIP_SPEED: 70,           // slower than this at the lip and it rolls back: foul

  /* The flight. Carry is speed at the lip times CARRY_S, then jittered. */
  FLIGHT_FRAMES: 32,           // fixed airtime, so the arc reads the same every throw
  CARRY_S: 0.55,               // seconds of carry per unit of lip speed
  CARRY_JITTER: 0.035,         // +/- share of the carry, seeded per ball
  ANGLE_JITTER: 0.012,         // +/- radians at the lip, seeded per ball
  ARC_HEIGHT: 38,              // peak height of the arc, for drawing only

  /* The board after landing. */
  ROLL_KEEP: 0.18,             // share of the speed kept after the landing
  BOARD_FRICTION: 170,         // deceleration on the board, units/s^2
  BOARD_HALF: 60,              // the side gutters start past this
  BOARD_FRONT: 196,            // the bottom lip: landing short of it is foul
  BOARD_BACK: 336,             // the back gutter
  EDGE_BAND: 1.6,              // a rest this close to a ring line can hop
  HOP: 2.6,                    // how far a hop moves it off the line
  POCKET_R: 6.2,                 // home run pocket radius
  SETTLE_FRAMES: 40,           // the pause on a result before the next ball

  /* Scoring. Max is BALLS * MAX_BASES = 36. */
  BASES: Object.freeze({ '1B': 1, '2B': 2, '3B': 3, HR: 4, F: 0 }),
  HOT_BONUS: 1,

  /* Gems bonus by score band (5 for finishing is added by shared/gems.js). */
  GEM_BANDS: Object.freeze([{ min: 0, bonus: 0 }, { min: 12, bonus: 3 }, { min: 20, bonus: 6 }, { min: 28, bonus: 10 }]),

  /* The server refuses a log longer than this (30 minutes of frames). */
  MAX_FRAMES: 60 * 60 * 30
});

/* THE RISK AND THE REWARD, measured by build/tune-rollball.mjs (300 runs a
   player): a good player aiming at the home run pockets lands 45% home runs,
   39% singles and 15% fouls, for a mean of 21 and a best of 34. The same hand
   aiming at the middle of the rings means 23 but tops out near 30. So the
   middle is the safe play and the pockets are how a board is won. The pockets
   sit just inside the single ring, so a near miss is a single, not a foul;
   only a long miss goes in the gutter.

   Eight layouts. A day picks one, then a hot ring. Ring radii are single,
   double, triple. A pocket with `slide` moves side to side on a sine:
   amplitude in units, period in frames, phase 0 or 0.5. */
const P = (x, y, slide) => ({ x, y, slide: slide || null });
export const LAYOUTS = Object.freeze([
  { id: 'classic',  name: 'Classic board', ring: { x: 0, y: 262, r: [52, 20, 4.2] }, pockets: [P(-29, 299), P(29, 299)] },
  { id: 'lean-l',   name: 'Leaning left',  ring: { x: -6, y: 262, r: [52, 20, 4.2] }, pockets: [P(-35, 297), P(24, 300)] },
  { id: 'lean-r',   name: 'Leaning right', ring: { x: 6, y: 262, r: [52, 20, 4.2] }, pockets: [P(-24, 300), P(35, 297)] },
  { id: 'deep',     name: 'Deep board',    ring: { x: 0, y: 270, r: [50, 19, 3.9] }, pockets: [P(-27, 307), P(27, 307)] },
  { id: 'shallow',  name: 'Short board',   ring: { x: 0, y: 252, r: [52, 20, 4.2] }, pockets: [P(-30, 289), P(30, 289)] },
  { id: 'slide-l',  name: 'Moving left pocket',  ring: { x: 0, y: 262, r: [52, 20, 4.2] },
    pockets: [P(-29, 300, { amp: 10, period: 220, phase: 0 }), P(29, 299)] },
  { id: 'slide-r',  name: 'Moving right pocket', ring: { x: 0, y: 262, r: [52, 20, 4.2] },
    pockets: [P(-29, 299), P(29, 300, { amp: 10, period: 220, phase: 0.5 })] },
  { id: 'twins',    name: 'Twin sliders',  ring: { x: 0, y: 263, r: [51, 19, 3.9] },
    pockets: [P(-29, 301, { amp: 8, period: 260, phase: 0 }), P(29, 301, { amp: 8, period: 260, phase: 0.5 })] }
]);
export const HOT_ZONES = Object.freeze(['1B', '2B', '3B']);
