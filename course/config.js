/* Run The Course: every number the game plays, as data.
 *
 * Nothing in the simulation, the renderer or the page holds a tuning number
 * of its own. Change a value here and the game changes with no code edit
 * (test/config.test.mjs holds that). Bump VERSION when a value changes: a
 * filed shift carries the version it was played on.
 *
 * Numbers for later phases (unlock costs, staff, the real-time layer) are
 * recorded now so earlier phases fit them. Nothing reads them yet. */
export const GAME = Object.freeze({ name: 'Run The Course', slug: 'course', logo: '/course/logo.svg' });

export const CONFIG = {
  version: 3,
  schema: 1,

  shift: {
    tick: 10,                 // simulation ticks a second
    dawnS: 30,                // the mowing phase before the gates open
    openS: 210,               // gates open, 7:00 to 19:00 in game
    closeMaxS: 150,           // after closing, groups still out get this long to finish
    lastTeeS: 130,            // no tee time later than this into the open phase
    firstTeeS: 6,
    clockOpen: 7, clockClose: 19,
    walk: 4, mower: 6, cart: 11,          // units a second
    cartDrift: 0.25, mowerDrift: 0.5,     // share of the wanted speed gained a tick
    golferWalk: 4, golferCart: 8,
    carry: 2,
    rings: { checkin: 2.5, sendoff: 1, mow: 3, pad: 1.5 },
    ringR: 2.2, padR: 2.4, enterR: 1.5, leaveR: 2.6,
    teeGapS: 15,              // minimum gap between groups sent off tee 1
    watchdogS: 75             // a group that has not advanced in this long is moved on
  },

  golfers: {
    groupsDay1: 5,
    bookingsPerStar: 0.5,     // 50% more groups a star above 2.0
    sizeOdds: [0.15, 0.35, 0.20, 0.30],
    tierOdds: { scratch: 0.05, good: 0.2, average: 0.4, hacker: 0.25, beginner: 0.1 },
    paceOdds: { veryFast: 0.05, fast: 0.2, normal: 0.5, slow: 0.2, verySlow: 0.05 },
    paceFactor: { veryFast: 0.7, fast: 0.85, normal: 1.0, slow: 1.3, verySlow: 1.6 },
    sizeFactor: [0.6, 0.8, 0.9, 1.0],
    holeS: { 3: 14, 4: 20, 5: 26 },       // a foursome's time on a hole, by par
    cartFactor: 0.8,
    patience: { counter: 25, tee1: 30, course: 40 }
  },

  economy: {
    feePerHole: 1,            // dollars a golfer a hole played
    tipMax: 0.3,              // of the fee, scaled by satisfaction
    goalDay1: 60, goalGrowth: 1.06,
    goalShare: 0.75,          // the goal is never more than this share of the fees booked
    startCash: 0,
    pads: {
      cart_barn: { name: 'Cart Barn', cost: 60, buildS: 10, kind: 'unlock' },
      putting_green: { name: 'Putting Green', cost: 90, buildS: 15, kind: 'unlock' },
      snack_shack: { name: 'Snack Shack', cost: 180, buildS: 20, kind: 'unlock' },
      driving_range: { name: 'Driving Range', cost: 450, buildS: 30, kind: 'unlock' },
      hole_4: { name: 'Hole 4', cost: 1000, buildS: 1800, kind: 'hole', hole: 4 }
    },
    /* Everything that levels up. Each has its own pad. Everything starts at level 1;
       a level costs `cost` times `growth` for each level already bought, to the
       nearest $5. Each effect below is what ONE level adds. `needs` names a pad
       that must be built first. */
    upgradeMax: 10, upgradeGrowth: 1.45,
    tierEvery: 3,             // a building changes its look every this many levels
    snackBase: 1, rangeBase: 1,   // dollars a golfer at the first level of each
    upgradeQuietS: 12,         // the goal line only sends you to a pad when no group needs you for this long
    upgrades: {
      boots:     { name: 'Boots',       cost: 20, walk: 0.25 },                      // your walking speed, units a second
      shop:      { name: 'Pro Shop',    cost: 25, checkin: 0.07, fee: 0.04 },        // check in that share faster; every fee that share higher
      starter:   { name: 'Starter Box', cost: 30, sendoff: 0.08, patience: 2 },      // send off faster; groups wait longer on tee 1, seconds
      shed:      { name: 'Mower Shed',  cost: 30, mow: 0.2, mower: 0.4 },            // seconds less to cut a green; mower speed
      my_cart:   { name: 'Your Cart',   cost: 35, cart: 0.6 },                       // your cart's speed
      hole_1:    { name: 'Hole 1',      cost: 40, hole: 1, fee: 0.08, decay: 1.5 },  // that hole's fee that share higher; its green wears less a day
      hole_2:    { name: 'Hole 2',      cost: 40, hole: 2, fee: 0.08, decay: 1.5 },
      hole_3:    { name: 'Hole 3',      cost: 40, hole: 3, fee: 0.08, decay: 1.5 },
      cart_barn: { name: 'Cart Barn',   cost: 50, needs: 'cart_barn', rental: 0.5, pace: 0.02 },   // dollars a golfer for the cart; holes play that share faster
      gardens:   { name: 'Gardens',     cost: 45, design: 0.05 },                    // the course looks better: the design part of every review rises
      parking:   { name: 'Parking Lot', cost: 55, bookings: 0.06 },                  // that share more groups booked
      clubhouse: { name: 'Clubhouse',   cost: 60, tip: 0.02, patience: 2 },          // the most a group tips rises by that share of the fee; groups wait longer at the counter
      putting_green: { name: 'Putting Green', cost: 70, needs: 'putting_green', practice: 0.25, patience: 2 },   // dollars a golfer to warm up; groups wait longer out on the course
      snack_shack:   { name: 'Snack Shack',   cost: 90, needs: 'snack_shack', snack: 0.5 },                      // dollars more a golfer spends at the turn
      driving_range: { name: 'Driving Range', cost: 140, needs: 'driving_range', range: 0.5 }                    // dollars more a golfer spends on range balls
    }
  },

  stars: {
    start: 2.0, window: 40,
    weights: { condition: 0.30, pace: 0.30, service: 0.25, design: 0.15 },
    designNeutral: 0.5,
    walkOffReview: 1,
    greenDecay: 20, fairwayDecay: 10, greenStart: 60, fairwayStart: 70
  },

  /* The shot model. Errors are a share of the shot's length. `mishit` and `short`
     (the error of a chip) are the two values tuned until each tier's average on
     the par 72 test course lands on its target (test/shot.test.mjs holds it). */
  shot: {
    yardsPerUnit: 8,
    tiers: {
      scratch:  { handicap: 0,  max: 260, side: 0.04,  dist: 0.04, putt: 9,   bunkerStay: 0.05, mishit: 0.151, short: 0.321, target: 72 },
      good:     { handicap: 8,  max: 240, side: 0.06,  dist: 0.05, putt: 7.5, bunkerStay: 0.10, mishit: 0.179, short: 0.349, target: 81 },
      average:  { handicap: 18, max: 215, side: 0.085, dist: 0.07, putt: 6,   bunkerStay: 0.17, mishit: 0.197, short: 0.357, target: 92 },
      hacker:   { handicap: 28, max: 190, side: 0.11,  dist: 0.09, putt: 5,   bunkerStay: 0.24, mishit: 0.201, short: 0.361, target: 103 },
      beginner: { handicap: 36, max: 160, side: 0.14,  dist: 0.12, putt: 4,   bunkerStay: 0.30, mishit: 0.191, short: 0.371, target: 115 }
    },
    mishitDist: 0.45,         // a mishit goes this share of the way
    rough: { dist: 0.85, error: 1.3 },
    bunker: { dist: 0.70, error: 1.5 },
    water: { penalty: 1 },
    trees: { block: 0.5, punch: 60 },
    fairwayHalf: 17, greenR: 11,          // yards
    shortFrom: 60,                        // inside this many yards a shot is a chip, with the tier's short error
    puttCap: 0.99,
    threePutt: { from: 18, per: 0.006, skill: 12 },   // chance rises past `from` feet, falls with the putt constant
    maxStrokes: 12
  },

  /* Recorded for later phases. Unused in phase 1. */
  later: {
    unlocks: { snack_shack: [180, 120], driving_range: [450, 600], hole_5: [2200, 3600], hole_6: [4000, 7200],
      beverage_cart: [6500, 3600], putting_green: [9000, 10800], hole_7: [14000, 14400], hole_8: [20000, 21600],
      hole_9: [28000, 28800], bar_grill: [45000, 28800], retail: [70000, 28800], back_nine_first: [100000, 43200],
      back_nine_growth: 1.35, simulator: [1500000, 86400] },
    staff: { cart_attendant: 1500, starter: 2500, cook: 5000, greenskeeper: 8000, beverage_driver: 12000,
      marshal: 15000, teaching_pro: 20000, night_manager: 40000, efficiency: [0.7, 0.9] },
    upgradeGrowth: 1.6,
    design: { startPoints: 6, perMastery: 2, maxPoints: 30 },
    turf: { openAt: 60, gainPerDay: 13 },
    realtime: { shiftsPerDay: [3, 4, 5], bonusShifts: 1, idleShare: 0.2, idleCapH: [4, 8, 12], seasonDays: 28,
      streakMax: 30, streakBooking: 0.01, shieldEvery: 7, shieldMax: 2 },
    rating: { rounds: 500, bogeyHandicap: 20, slope: 5.381, slopeMin: 55, slopeMax: 155 }
  }
};
