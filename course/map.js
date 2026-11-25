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
  gate: { x: -24, y: -20 },
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
    hole_4: { x: -6, y: 15 }
  },
  /* one pad for each thing that levels up, beside the thing itself */
  upgradePads: {
    boots: { x: -2, y: -15.5 }, shop: { x: 10, y: 1.5 }, starter: { x: 3, y: 19.5 }, shed: { x: -19, y: 3 },
    my_cart: { x: 15.5, y: -13 }, hole_1: { x: 15, y: 30 }, hole_2: { x: 63, y: 45.5 }, hole_3: { x: 35, y: 12.5 },
    cart_barn: { x: 24, y: -6 }, clubhouse: { x: -10, y: -3 }
  },
  snackShack: { x: 26, y: -12 },              // at the turn, between 9 and 10
  range: { x: -44, y: -22, w: 34, d: 22 },
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
  trees: [[-20, 12], [-26, 4], [24, 22], [28, 30], [48, 28], [50, 52], [30, 52], [66, 48], [70, 24], [-18, 34],
    [-36, 16], [-40, 40], [-66, 48], [-30, 60], [0, 78], [36, 76], [78, 66], [92, 50], [94, 20], [70, 2],
    [50, -16], [20, -22], [-10, -26], [-62, 10], [-64, -8], [86, -10], [4, 50], [-4, 40], [22, 6], [90, 76]]
};
