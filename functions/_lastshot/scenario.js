/* THE SCENARIO IS ONE OBJECT. Every number the game plays by lives here, so a
 * daily (or a second scenario) later is a second object, not a code change.
 *
 * v1: down 1, 22.0 on the clock, shot clock off, the ball at the top of the
 * key with O1. Any make wins if it leaves them under 5 seconds. Down 1 rather
 * than down 2 is the owner's call (2026-10-17): down 2, a made two only ties.
 *
 * Positions are in feet on the half court (court-geo.js): x 0 to 50 across,
 * y 0 at the baseline. Generic rosters only: no real players or teams. */
export const SCENARIO = Object.freeze({
  id: 'down-1-v1',
  title: 'Down 1. 22 seconds. Your ball.',
  clock: 22.0,
  us: 87,
  them: 88,

  /* A make with less than this left wins outright. With this much or more,
     they get the ball back. */
  winWindow: 5.0,
  /* No shot by now and whoever has the ball throws it up. */
  bailoutAt: 3.0,

  /* Who is on the floor. Archetypes set the make rates below. */
  roster: {
    O1: { arch: 'PG' }, O2: { arch: 'SG' }, O3: { arch: 'SF' }, O4: { arch: 'PF' }, O5: { arch: 'C' }
  },
  handler: 'O1',

  /* The default floor: O1 up top, wings at the free throw line extended,
     bigs on the blocks. Draggable on the clipboard. */
  spots: {
    O1: { x: 25, y: 31 }, O2: { x: 43, y: 19 }, O3: { x: 7, y: 19 }, O4: { x: 32, y: 8 }, O5: { x: 18, y: 8 }
  },
  /* Each X guards the O with the same number. Not editable. */
  matchups: { X1: 'O1', X2: 'O2', X3: 'O3', X4: 'O4', X5: 'O5' },

  /* Make rate by archetype and zone for an open, set shot (contest and
     movement scale it down, see shot.js). */
  archetypes: {
    PG: { label: 'PG', role: 'handler', rim: 0.58, two: 0.42, three: 0.36 },
    SG: { label: 'SG', role: 'best shooter', rim: 0.58, two: 0.46, three: 0.43 },
    SF: { label: 'SF', role: 'slasher', rim: 0.66, two: 0.41, three: 0.34 },
    PF: { label: 'PF', role: 'screener', rim: 0.60, two: 0.38, three: 0.24 },
    C: { label: 'C', role: 'rim finisher', rim: 0.68, two: 0.30, three: 0.04 }
  },

  tuning: {
    /* Movement, in feet per second. */
    runSpeed: 13, dribbleSpeed: 11, defSpeed: 12.5,
    /* How long a defender takes to react, in seconds (the lag). */
    defLag: 0.22,
    /* Gap a defender keeps from his man, toward the rim. */
    onBallGap: 3.5, offBallGap: 4.5,
    /* How far toward the ball an off ball defender helps (share of the way). */
    help: 0.18,
    /* A cutter within this many feet of a set screen is screened. */
    screenReach: 3.2,
    /* Fight over: the defender is held this long, then chases. */
    overHold: 0.9,
    /* Go under: how far the defender sags off, and for how long. */
    underGap: 7.5, underTime: 2.6,

    passSpeed: 42,
    /* A pass longer than this, or with a defender in its lane, risks a turnover. */
    longPass: 28, laneCover: 2.6,
    passRisk: 0.08,

    /* Shot quality. Contest scales from contestMin (a hand in the face) to
       contestMax (nobody within openAt feet). */
    contestFrom: 1.5, openAt: 6, contestMin: 0.40, contestMax: 1.15,
    movingThree: 0.85, movingTwo: 0.88, movingRim: 1.0, movingAt: 3,
    bailout: 0.75,
    minMake: 0.02, maxMake: 0.95,
    shotFlight: 1.0,

    /* Their possession after an early make: chance they score. */
    answerBase: 0.30, answerPerSec: 0.035, answerMax: 0.75,
    /* Up 2 after a three, they need a three of their own: this share as often. */
    answerNeedThree: 0.6
  }
});

export const SCHEMES = Object.freeze(['switch', 'over', 'under']);
export const SCHEME_NAMES = Object.freeze({ switch: 'Switch', over: 'Fight over', under: 'Go under' });
