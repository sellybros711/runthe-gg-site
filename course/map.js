/* Run The Course: the property, laid out for all 18 holes from the first day.
 *
 * World units: x east, y north, 1 unit = CONFIG.shot.yardsPerUnit yards.
 * Holes 1 to 3 are open. Holes 4 to 9 sit in their final places as locked
 * plots. The back nine is a tract across the road. Nothing here moves when a
 * later phase opens more of it: the route graph, the camera bounds and the
 * cart paths already cover the whole site.
 *
 * A hole's `line` is its ideal line: tee, any landing nodes, green. */
export const MAP = {
  draw: { greenR: 3, fairwayHalf: 2.6, teeR: 1.3 },   // how big the turf is drawn; mowing uses greenR
  bounds: { x0: -72, x1: 196, y0: -42, y1: 86 },
  start: { x: 3, y: -9 },
  gate: { x: -13, y: -17.5 },                 // where golfers walk in: the top of the parking lot
  parking: { x: -14, y: -22.5, w: 16, d: 9 },
  entrance: { x: -40, y: -37 },               // the road in from the south west
  puttingGreen: { x: 25, y: 12.5, r: 4.2 },
  gardens: { x: 0, y: 8.5 },
  clubhouse: { x: 0, y: 0, w: 12, d: 8, h: 4 },
  counter: { x: 3, y: -6.4 },                 // the ring the player stands in
  queue: { x: 3, y: -10.5, dx: -2.4, dy: 0 },   // groups line up from here
  shopExit: { x: -4, y: -9 },
  shed: { x: -13, y: 8, w: 5, d: 4, h: 3 },
  mowerPark: { x: -12, y: 3 },
  cartPark: { x: 10, y: -10 },
  mowerHome: { x: 6.5, y: -13.5 },            // where the goal line parks the mower by the shop, off every walking line
  teeRing: { x: 6.6, y: 14 },                 // the ring beside tee 1
  teeWait: { dx: 2.6, dy: -2.2 },             // where a waiting group stands, off the tee
  pads: {
    cart_barn: { x: 17, y: -6 },
    putting_green: { x: 25, y: 5.5 },
    snack_shack: { x: 31.5, y: -16.5 },
    driving_range: { x: -24, y: -31 },
    hole_4: { x: -3, y: 25 }, hole_5: { x: -63, y: 34 }, hole_6: { x: -44, y: 61 }
  },
  /* one pad a place (CONFIG.economy.places), beside the place itself */
  places: {
    clubhouse: { x: -10, y: -3 }, shop: { x: 10, y: 1.5 }, starter: { x: 3, y: 19.5 }, shed: { x: -19, y: 3 },
    parking: { x: 1.5, y: -22.5 }, gardens: { x: -7, y: 9.5 }, hole_1: { x: 15, y: 30 }, hole_2: { x: 63, y: 45.5 }, hole_3: { x: 35, y: 12.5 },
    cart_barn: { x: 17, y: -6 }, putting_green: { x: 25, y: 5.5 }, snack_shack: { x: 31.5, y: -16.5 }, driving_range: { x: -24, y: -31 }, hole_4: { x: -3, y: 25 },
    hole_5: { x: -63, y: 34 }, hole_6: { x: -44, y: 61 }
  },
  /* the hands-on stations: the ring you stand in, and where the group stands */
  keys: { ring: { x: 12.8, y: -1.2 }, spot: { x: 10.4, y: -1.6 } },
  snack: { ring: { x: 26, y: -15.4 }, spot: { x: 23, y: -17.2 } },
  rangeRing: { x: -28, y: -13.5 },
  snackShack: { x: 26, y: -12 },              // at the turn, between 9 and 10
  range: { x: -47, y: -21, w: 34, d: 18 },
  road: { x: 100, w: 5 },
  backNine: { x0: 106, x1: 192, y0: -36, y1: 80, sign: { x: 104, y: 8 } },
  waypoints: { toTee: [{ x: 9.5, y: -7 }, { x: 10, y: 9 }] },
  holes: [
    { ord: 1, par: 3, template: 'p3_short',  line: [{ x: 10, y: 14 }, { x: 10, y: 33 }] },
    { ord: 2, par: 4, template: 'p4_dogleg', line: [{ x: 16, y: 38 }, { x: 40, y: 45 }, { x: 60, y: 40 }] },
    { ord: 3, par: 3, template: 'p3_home',   line: [{ x: 58, y: 31 }, { x: 40, y: 16 }] },
    { ord: 4, par: 4, template: 'plot', line: [{ x: -8, y: 20 }, { x: -30, y: 28 }, { x: -52, y: 30 }] },
    { ord: 5, par: 3, template: 'plot', line: [{ x: -57, y: 37 }, { x: -57, y: 58 }] },
    { ord: 6, par: 5, template: 'plot', line: [{ x: -50, y: 65 }, { x: -20, y: 72 }, { x: 14, y: 67 }] },
    { ord: 7, par: 4, template: 'plot', line: [{ x: 21, y: 61 }, { x: 44, y: 66 }, { x: 66, y: 62 }] },
    { ord: 8, par: 3, template: 'plot', line: [{ x: 72, y: 56 }, { x: 85, y: 40 }] },
    { ord: 9, par: 4, template: 'plot', line: [{ x: 84, y: 31 }, { x: 62, y: 10 }, { x: 34, y: -4 }] }
  ],
  openAtStart: [1, 2, 3],
  /* THE LAYOUTS. Holes 4 to 6 are built to one of three layouts, chosen when the hole is bought.
     Each keeps the hole's tee and finds its own green. `classic` is the line in `holes` above, and
     the one a hole gets if it was bought before there was a choice. Hazards are in world units:
     a bunker slows the next shot, water costs a stroke (shot.js). What each layout pays and how it
     looks to a review is in CONFIG.economy.layouts. */
  layouts: {
    4: {
      short:     { par: 3, line: [{ x: -8, y: 20 }, { x: -27, y: 25 }],
                   hazards: [{ type: 'bunker', x: -25, y: 21.6, r: 1.5 }, { type: 'bunker', x: -29.6, y: 28, r: 1.3 }] },
      classic:   { par: 4, line: [{ x: -8, y: 20 }, { x: -30, y: 28 }, { x: -52, y: 30 }],
                   hazards: [{ type: 'bunker', x: -31, y: 31.6, r: 1.8 }, { type: 'bunker', x: -50, y: 27, r: 1.5 }] },
      signature: { par: 4, line: [{ x: -8, y: 20 }, { x: -29, y: 21 }, { x: -46, y: 30 }],
                   hazards: [{ type: 'water', x: -38, y: 26.4, r: 2.5 }, { type: 'bunker', x: -48.6, y: 32.6, r: 1.4 }] }
    },
    5: {
      short:     { par: 3, line: [{ x: -57, y: 37 }, { x: -58, y: 52 }],
                   hazards: [{ type: 'bunker', x: -60.4, y: 50.4, r: 1.3 }] },
      classic:   { par: 3, line: [{ x: -57, y: 37 }, { x: -57, y: 58 }],
                   hazards: [{ type: 'bunker', x: -59.8, y: 57, r: 1.4 }, { type: 'bunker', x: -54.2, y: 59, r: 1.4 }] },
      signature: { par: 4, line: [{ x: -57, y: 37 }, { x: -68, y: 52 }, { x: -60, y: 66 }],
                   hazards: [{ type: 'water', x: -63.4, y: 59.6, r: 2.3 }, { type: 'bunker', x: -66, y: 55.4, r: 1.5 }, { type: 'bunker', x: -57.4, y: 67.6, r: 1.3 }] }
    },
    6: {
      short:     { par: 4, line: [{ x: -50, y: 65 }, { x: -28, y: 70 }, { x: -10, y: 68 }],
                   hazards: [{ type: 'bunker', x: -12, y: 71.2, r: 1.5 }] },
      classic:   { par: 5, line: [{ x: -50, y: 65 }, { x: -20, y: 72 }, { x: 14, y: 67 }],
                   hazards: [{ type: 'bunker', x: -21, y: 75.6, r: 1.8 }, { type: 'bunker', x: 11.4, y: 64, r: 1.5 }] },
      signature: { par: 5, line: [{ x: -50, y: 65 }, { x: -22, y: 68 }, { x: 10, y: 70 }],
                   hazards: [{ type: 'water', x: -5, y: 69, r: 2.6 }, { type: 'bunker', x: 12.6, y: 73, r: 1.4 }, { type: 'bunker', x: -24, y: 64.6, r: 1.5 }] }
    }
  },
  trees: [[-20, 12], [-26, 4], [24, 22], [28, 30], [48, 28], [50, 52], [30, 52], [66, 48], [70, 24], [-18, 34],
    [-36, 16], [-40, 40], [-66, 48], [-30, 60], [0, 78], [36, 76], [78, 66], [92, 50], [94, 20], [70, 2],
    [50, -16], [20, -22], [-10, -26], [-62, 10], [-64, -8], [86, -10], [4, 50], [-4, 40], [20, 20], [90, 76]]
};
