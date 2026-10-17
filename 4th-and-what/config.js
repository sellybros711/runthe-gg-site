/* 4th and What: the scenario and every number the sim plays by.
 *
 * ONE OBJECT IS THE SCENARIO: the distance, where the ball is and who is on
 * the field. A daily later is a different SCENARIO on a different day; the
 * engine reads nothing else. TODO(daily): pick SCENARIO by the Eastern day.
 *
 * Units: yards and seconds. A play is drawn relative to the ball: dx across
 * the field (negative is the offense's left), dy downfield (negative is the
 * offense's own backfield). The engine turns that into field yards: X across
 * from the left sideline (0 to 53.33), Y from the offense's own goal line, so
 * the end zone it attacks starts at Y 100.
 *
 * The rates these numbers produce for a sensible drawn play are measured by
 * build/tune.mjs and recorded in the vault (games/4th-and-what/4th-and-what-formulas.md).
 * Change a number here, run the tuner, update the note.
 *
 * Plain script: window.FAW_CONFIG in the browser, module.exports in node.
 */
(function (root) {
  'use strict';

  /* The distances the picker offers. */
  var DISTANCES = [1, 3, 5, 7, 10, 15];

  /* Generic players, no real names or teams. Each archetype is a few numbers:
       speed   top speed, yards a second
       burst   seconds to reach it from a standstill
       cut     how much of his speed survives a 90 degree break (0 to 1)
       hands   added to the catch roll (logit units)
       elusive added to the broken tackle chance
       power   a ball carrier's push at contact, and a blocker's hold
     The QB adds arm (ball speed) and accuracy (logit units on every throw). */
  var ARCHETYPES = {
    qb:         { label: 'QB', name: 'Quarterback', speed: 7.0, burst: 0.55, cut: 0.6, hands: 0, elusive: 0.02, power: 0.5, arm: 26, accuracy: 0 },
    rb:         { label: 'RB', name: 'Running back', speed: 8.9, burst: 0.4, cut: 0.78, hands: -0.15, elusive: 0.12, power: 0.6 },
    burner:     { label: 'X', name: 'Burner', speed: 9.6, burst: 0.45, cut: 0.62, hands: -0.1, elusive: 0.06, power: 0.3 },
    possession: { label: 'Z', name: 'Possession receiver', speed: 8.5, burst: 0.45, cut: 0.72, hands: 0.35, elusive: 0.04, power: 0.45 },
    slot:       { label: 'H', name: 'Slot', speed: 9.0, burst: 0.38, cut: 0.82, hands: 0.15, elusive: 0.1, power: 0.35 },
    te:         { label: 'Y', name: 'Tight end', speed: 7.9, burst: 0.5, cut: 0.6, hands: 0.2, elusive: 0.02, power: 0.75 }
  };

  var SCENARIO = {
    id: 'v1',
    distance: 5,
    /* the opponent's 40: a deep shot can score, a first down is the usual goal */
    ballOn: 40,
    /* across the field: the middle of the hashes */
    ballX: 80 / 3,
    roster: { QB: 'qb', RB: 'rb', WR1: 'burner', WR2: 'possession', SLOT: 'slot', TE: 'te' }
  };

  var TUNING = {
    dt: 1 / 30,                 /* the sim's step */
    maxTime: 12,                /* a play that is still going is whistled dead */

    /* PROTECTION. The pocket holds for base seconds, plus perBlocker for every
       blocker over the rushers (five linemen plus whoever you keep in), less
       for every rusher over them, plus or minus jitter. Under center adds the
       time of the drop. */
    pocket: { base: 2.55, perBlocker: 0.42, jitter: 0.3, underCenter: 0.2, min: 1.35, max: 4.4 },
    /* A collapsed pocket with nobody to dump it to: this share are sacks, the rest thrown away. */
    sackShare: 0.6,

    /* THE THROW. The QB throws to the primary target when he finishes the
       route, or earlier once he has `separation` yards on everybody (and has
       been running `minRead` seconds), whichever comes first. Finishing is
       read on timing: the ball leaves when he is the release, plus timing,
       plus the ball's flight, from the end of the drawn route, so the ball
       meets him about where the route ends. The ball is led along the route. */
    read: { separation: 3.0, minRead: 0.85, release: 0.18, timing: 0.05 },
    ball: { loft: 0.0005, height: 2.0 },
    /* the receiver runs his route while the ball is in the air, and adjusts to it for the last adjust seconds */
    adjust: 0.35,

    /* THE CATCH, as a logit, then squashed by a curve built only from + - * /
       so every browser lands on the same chance to the last bit:
         base
         + perSep  per yard of separation over 2 (capped at sepCap)
         - perTen  per ten yards of throw over 12
         - deep    times the square of the yards past deepFrom, over 100
         - pressure at full pressure (it scales from 0)
         + toward  when the receiver is coming back to the QB (scales -1 to 1)
         + the receiver's hands + the QB's accuracy
       Separation is to the nearest defender, and one trailing the receiver
       (nearer the QB than he is) counts trail yards further away. */
    catch: { base: 0.55, perSep: 0.85, sepCap: 6, perTen: 0.6, deepFrom: 20, deep: 0.15, trail: 1.5, pressure: 0.9, toward: 0.35, tight: 0.7 },

    /* MAN COVERAGE stays cushion yards over the top of his man, and plays his side to side as it was lag seconds ago. A man running straight up the field eats that cushion by eatBy seconds. */
    man: { lagDB: 0.3, lagLB: 0.45, cushion: 1.6, eatBy: 2.2 },
    /* ZONE: a defender drops to his landmark and plays the nearest receiver
       inside radius yards of it, leaning pull of the way toward him at speed
       of his top speed. A deep defender keeps everything in front: his depth
       answers the deepest receiver within reach times his column's width who
       is within threat yards of his depth (cushion yards in front of him, plus
       bail yards for every yard a second he is coming), and his side to side
       follows the man in his own column, seen deepLag seconds late. */
    zone: { radius: 6.5, react: 0.3, pull: 0.6, speed: 0.85, threat: 9, deepLag: 0.35, cushion: 1.4, bail: 0.15, reach: 1.7 },
    /* A receiver's sharp cut costs the man on him this many seconds at half speed, per right angle. */
    breakStumble: 0.3,
    /* After the throw, a defender in front of the receiver and within breakRange yards of the catch plays the spot after breakOnBall seconds, at breakSpeed of his top speed. Anybody behind keeps playing his coverage. */
    breakOnBall: 0.3, breakRange: 9, breakSpeed: 0.5,

    /* RUN BLOCKING: each block holds its man for a window, base seconds plus
       or minus jitter, scaled by the blocker's power. A held defender moves
       at heldSpeed of his speed. */
    runBlock: { base: 1.8, jitter: 0.7, heldSpeed: 0.25, leadBonus: 0.3 },
    /* when the defense sees it is a run */
    readRun: { dl: 0.0, lb: 0.55, db: 0.75 },
    handoff: 0.35,

    /* CONTACT. A free defender within reach yards makes contact. The carrier
       breaks it with this chance (plus his elusiveness, less for every other
       defender close by), and otherwise falls forward up to fall yards.
       A defender still engaged in a block stops him only with the pile
       chance, falling half as far. Fumbles are runs only. */
    tackle: { reach: 1.3, broken: 0.06, crowd: 0.05, momentum: 0.16, fall: 1.2, missed: 0.7, fumble: 0.008, pile: 0.12 },

    /* how hard a ball carrier in the open steers away from the nearest tacklers */
    avoid: 0.8,

    /* DEFENDERS: speed in yards a second by role. */
    speed: { dl: 6.6, lb: 8.0, cb: 9.1, s: 8.7 },

    /* THE CALL, rolled every snap and shown after. Weights by distance band. */
    calls: {
      short:  { cover0: 0.2, cover1: 0.4, cover2: 0.12, cover3: 0.28, blitz: 0.45 },
      medium: { cover0: 0.1, cover1: 0.32, cover2: 0.28, cover3: 0.3, blitz: 0.3 },
      long:   { cover0: 0.04, cover1: 0.22, cover2: 0.42, cover3: 0.32, blitz: 0.18 }
    },
    /* every defender past six in the box adds this to the blitz chance */
    boxBlitz: 0.08,

    /* PLAYBACK: how much slower the picture runs near the moments that decide it. */
    slow: { throw: 0.45, catch: 0.35, tackle: 0.4, window: 0.35 }
  };

  var API = { DISTANCES: DISTANCES, ARCHETYPES: ARCHETYPES, SCENARIO: SCENARIO, TUNING: TUNING };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.FAW_CONFIG = API;
})(typeof window !== 'undefined' ? window : this);
