/* THE SCENARIO IS ONE OBJECT. Every number the game plays by lives here, so a
 * daily (or a second scenario) later is a second object, not a code change.
 *
 * v1: down 1, 22.0 on the clock, shot clock off, the ball at the top of the
 * key with O1. Any make wins if it leaves them under 5 seconds. Down 1 rather
 * than down 2 is the owner's call (2026-10-17): down 2, a made two only ties.
 *
 * Positions are in feet on the half court (court-geo.js): x 0 to 50 across,
 * y 0 at the baseline. Generic rosters only: no real players or teams.
 *
 * Where the shooting numbers come from (NBA tracking, rounded): a catch and
 * shoot three with nobody within 6 feet goes in about 38 to 42 percent of the
 * time for a decent shooter, about 43 to 45 for a top one, and falls toward
 * 30 with a hand in the face. Pull up threes run about 4 points under catch
 * and shoot. The restricted area is about 65 percent league wide, high 70s for
 * an open dunker, mid 50s or worse into a set rim protector. A forced shot at
 * the end of a broken play is a coin you should not want to flip. */
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

  /* The default floor is a box set, the most common after timeout look: O1 up
     top with the ball, the bigs at the elbows, the wings on the blocks. Out
     of it you can run a pin-down for either wing, a ball screen from either
     elbow, a stagger, or a back screen. Draggable on the clipboard. */
  spots: {
    O1: { x: 25, y: 31 }, O2: { x: 32, y: 6.5 }, O3: { x: 18, y: 6.5 }, O4: { x: 18.5, y: 18.5 }, O5: { x: 31.5, y: 18.5 }
  },
  /* Each X guards the O with the same number, and is built like him (a PG on
     the PG, a C on the C), which is what makes a switch a mismatch. */
  matchups: { X1: 'O1', X2: 'O2', X3: 'O3', X4: 'O4', X5: 'O5' },

  /* Make rate by archetype and zone for an open, set shot (contest, movement
     and a bail-out scale it down, see shot.js). ARCADE TRUE (the owner,
     2026-11-13): positioning and play calling are real, and a good look falls
     more often than it would in the NBA. Getting open is what pays. */
  archetypes: {
    PG: { label: 'PG', role: 'handler', rim: 0.72, two: 0.55, three: 0.58 },
    SG: { label: 'SG', role: 'best shooter', rim: 0.72, two: 0.66, three: 0.80 },
    SF: { label: 'SF', role: 'slasher', rim: 0.82, two: 0.55, three: 0.60 },
    PF: { label: 'PF', role: 'screener', rim: 0.80, two: 0.52, three: 0.45 },
    C: { label: 'C', role: 'rim finisher', rim: 0.86, two: 0.38, three: 0.15 }
  },

  tuning: {
    /* Movement, in feet per second. runSpeed is a hard cut. dribbleSpeed is
       a handler working with the ball in a half court set, not a fast break. */
    runSpeed: 13, dribbleSpeed: 8, defSpeed: 14,
    /* How long a defender takes to react, in seconds (the lag). */
    defLag: 0.22,
    /* How a body moves (motion.js). runSpeed is the pace a route averages:
       a runner tops out at runTop times it, gets there at runAccel ft/s/s,
       brakes at runDecel into a corner or a stop, and turns as tight as
       turnGrip ft/s/s of sideways force allows, starting cornerCut feet early.
       A defender slides at slideShare of defSpeed, turns and runs once he is
       beatGap feet behind, and his first step is defAccel. A body is bodyR
       feet across from its middle: nobody runs through anybody. */
    runTop: 1.32, runAccel: 38, runDecel: 46, turnGrip: 60, cornerCut: 1.8,
    slideShare: 0.8, beatGap: 3.2, defAccel: 40, bodyR: 0.95,
    /* Bodies by archetype. size runs 1 (PG) to 5 (C): it decides who wins a
       mismatch at the rim and how much room a big gives a guard. A defender
       is X1 to X5, built like the O with his number. */
    size: { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 },
    /* Gap a defender keeps from the ball, toward the rim. Off the ball it is
       offGap by who he guards, and sag is how far he helps off that man: the
       defense stays glued to the shooter and leaves the center to help. */
    onBallGap: 3.0,
    offGap: { PG: 3.6, SG: 2.6, SF: 3.8, PF: 4.6, C: 5.5 },
    sag: { PG: 0.9, SG: 0.4, SF: 1.0, PF: 1.2, C: 1.5 },
    /* Help: how far toward the ball an off ball defender shades, one pass away
       and two passes away (the far side), scaled by the man's sag. */
    helpNear: 0.10, helpFar: 0.28, farSide: 24,
    /* Low man help: a ball inside helpZone feet with his defender beaten
       brings the nearest helper (never the one on the SG) after helpDelay. */
    helpZone: 13, helpDelay: 0.25,
    /* A big guarding a guard on the perimeter gives him this much more room,
       per point of size, so he cannot be blown by. */
    cushion: 1.0,

    /* A cut whose route passes within useReach of a set screen comes off it.
       He waits waitBack feet short of it until it is set. */
    useReach: 5, waitBack: 2,
    /* Fight over: the defender is stuck on the screener this long, then
       trails. The screener's man shows on the ball (or bumps a curl) for
       showTime so the cutter cannot turn the corner clean. */
    overHold: 0.35, showTime: 0.7,
    /* Go under: how far the defender sags off, and for how long. */
    underGap: 8, underTime: 2.2,
    /* Switch: the two defenders take a beat to call it and swap. */
    switchBeat: 0.2,
    /* Kept so an older build reads the same file. */
    screenReach: 3.2,

    passSpeed: 42,
    /* A pass longer than longPass feet, or thrown past a defender within
       laneCover feet of its line, risks a turnover. The risk is per pass:
       up to passRiskLong for distance and passRiskLane for a crowded lane. */
    longPass: 28, laneCover: 3, passRiskLong: 0.05, passRiskLane: 0.07,
    /* Catch to release, in seconds: a catch and shoot jumper, a pull up off
       the dribble, a finish at the rim. The defense closes out meanwhile. */
    gatherCatch: 0.45, gatherDribble: 0.35, gatherRim: 0.2,

    /* Shot quality: the contest share at 0, 2, 4 and 6 feet (6 or more is
       open), separately for jumpers and at the rim. Steep on purpose: a hand
       in the face is a miss most of the time, a clean look mostly falls. */
    contestJumper: [0.15, 0.3, 0.65, 1.0], contestRim: [0.45, 0.6, 0.8, 1.0],
    /* At the rim, each point of size the defender has on the shooter makes
       his contest this much stronger (and weaker the other way round). */
    sizeEdge: 0.18,
    /* Off the dribble and on the move. */
    pullupThree: 0.72, pullupTwo: 0.82, runningThree: 0.94, runningTwo: 0.96,
    /* A shot forced up at the bail-out mark. */
    bailout: 0.5,
    minMake: 0.02, maxMake: 0.9,
    shotFlight: 1.0,

    /* Their possession after an early make: chance they score, rising with
       the time they get, capped (a full possession with a timeout). Steep
       (2026-11-13): the clock is half the decision, so a make with 15 seconds
       left is answered most of the time and one with 6 left mostly is not. */
    answerBase: 0.35, answerPerSec: 0.045, answerMax: 0.85,
    /* Up 2 after a three, a two only ties it (overtime, a coin flip) and a
       three beats you: this share of their scores still loses it for you. */
    answerNeedThree: 0.6,
    /* A tie goes to overtime, a coin you flip. */
    overtimeWin: 0.5,

    /* ZONES. How often the rolled defense is a zone (late in a close game,
       about one possession in four at most levels below the pros). */
    zoneShare: 0.25,
    /* A zone shifts its shape toward the ball by this share of how far the
       ball is from the middle (across, and up and down the floor). */
    zoneShiftX: 0.35, zoneShiftY: 0.22,
    /* A zone defender takes the man nearest his spot within zoneReach feet,
       and never strays more than zoneLeash of the way to him. */
    zoneReach: 8, zoneLeash: 0.45, zoneGap: 3.2,
    /* The match-up zone: man to man that switches every screen and sags into
       the lane, by this much more than man does. */
    matchupSag: 1.5, matchupGap: 0.8
  }
});

/* THE DEFENSES. Man to man with one of three screen schemes, or a zone
   (the owner, 2026-10-30: zones next, for Test it above all). The rolled
   defense is a zone zoneShare of the time; the rest splits evenly across the
   man schemes. With zoneShare 0 the roll is exactly what it was before zones. */
export const SCHEMES = Object.freeze(['switch', 'over', 'under']);
export const ZONES = Object.freeze(['zone23', 'zone131', 'zone32', 'matchup']);
export const DEFENSES = Object.freeze([...SCHEMES, ...ZONES]);
export const SCHEME_NAMES = Object.freeze({ switch: 'Switch', over: 'Fight over', under: 'Go under',
  zone23: '2-3 zone', zone131: '1-3-1 zone', zone32: '3-2 zone', matchup: 'Match-up zone' });
export const isZone = d => ZONES.includes(d);
/* A zone that sits in its spots (the match-up zone follows its men instead). */
export const isAreaZone = d => d === 'zone23' || d === 'zone131' || d === 'zone32';
