/* Shut The Door: the shared contract, as code.
 *
 * CONTRACT.md is the spec. This file holds the constants from it, frozen, so
 * the engine and the UI never retype a number. Owned by the lead: Agent A and
 * Agent B import it and change it only through CONTRACT_REQUESTS.md.
 *
 * Headless and dependency-free. Browser: window.STD_CONTRACT. Node:
 * require('./contract.js').
 */

'use strict';
(function() {

const API_VERSION = 1;

/* The grid. 5x5, row-major, CATCHER'S VIEW (Statcast plate_x): row 0 high,
   col 0 the catcher's left (where a right-handed batter stands). The UI draws
   it mirrored, because the camera is the pitcher's (CONTRACT.md section 2). */
const GRID = Object.freeze({
  ROWS: 5,
  COLS: 5,
  CELLS: 25,
  ZONE_HALF_FT: 0.83,           // half the plate plus a ball's radius
  COL_FT: 0.83 * 2 / 3,         // one zone column, 0.553 ft
  ROW_ZN: 1 / 3,                // one zone row, in the batter's normalised height
});

function cellOf(row, col) { return row * GRID.COLS + col; }
function rowOf(cell) { return Math.floor(cell / GRID.COLS); }
function colOf(cell) { return cell % GRID.COLS; }
function inZone(cell) { const r = rowOf(cell), c = colOf(cell); return r >= 1 && r <= 3 && c >= 1 && c <= 3; }

/* The target point of a cell: its centre. x in feet (catcher's view), zn
   normalised (0 = bottom of the zone, 1 = top). */
function targetOf(cell) {
  const c = colOf(cell), r = rowOf(cell);
  return { x: (c - 2) * GRID.COL_FT, zn: 1 - (r - 0.5) * GRID.ROW_ZN };
}

/* The cell a point lands in. Anything past the chase band stays in it. */
function cellAt(x, zn) {
  const c = Math.max(0, Math.min(4, Math.floor(x / GRID.COL_FT + 2.5)));
  const r = Math.max(0, Math.min(4, Math.floor((1 - zn) / GRID.ROW_ZN + 1)));
  return cellOf(r, c);
}

/* The column the pitcher's-view picture puts a cell in. */
function screenCol(cell) { return GRID.COLS - 1 - colOf(cell); }

const PITCH_TYPES = Object.freeze(['FF', 'SI', 'FC', 'SL', 'ST', 'SV', 'CU', 'KC', 'CH', 'FS', 'FO', 'KN']);
const SHAPE_OF = Object.freeze({
  FF: 'ride', SI: 'run', FC: 'cut', SL: 'slide', ST: 'sweep', SV: 'sweep',
  CU: 'drop', KC: 'drop', CH: 'fade', FS: 'split', FO: 'split', KN: 'float',
});
const FAMILY_OF = Object.freeze({
  FF: 'hard', SI: 'hard', FC: 'hard',
  SL: 'breaking', ST: 'breaking', SV: 'breaking', CU: 'breaking', KC: 'breaking',
  CH: 'offspeed', FS: 'offspeed', FO: 'offspeed', KN: 'offspeed',
});

/* Bands, RELATIVE to the moment (the owner's call, 2026-10-17): rel = the
   hold% points a call lost / the mean points lost over every legal call in
   that state. Fixed point cutoffs failed on the real packs: one pitch moves
   hold% under a point in a one-run ninth and almost nothing with a big lead.
   Set from pipeline/band_sweep.mjs --relative: heart fastballs mostly orange
   and red in 9 of 10 packs (Chapman's three-run lead is the honest
   exception), the closer pool's calls about 23/34/29/14. */
const BANDS = Object.freeze([
  Object.freeze({ band: 'green', maxLost: 0.45 }),
  Object.freeze({ band: 'yellow', maxLost: 0.9 }),
  Object.freeze({ band: 'orange', maxLost: 1.5 }),
  Object.freeze({ band: 'red', maxLost: Infinity }),
]);
function bandOf(rel) { for (const b of BANDS) if (rel <= b.maxLost) return b.band; return 'red'; }

const SQUARE = Object.freeze({ green: '🟩', yellow: '🟨', orange: '🟧', red: '🟥' });
const SQUARES_PER_LINE = 10;

const OUTCOMES = Object.freeze(['door_shut', 'doors_open', 'walk_off']);
const OUTCOME_RANK = Object.freeze({ door_shut: 2, doors_open: 1, walk_off: 0 });
const OUTCOME_LABEL = Object.freeze({ door_shut: 'DOOR SHUT', doors_open: "DOOR'S OPEN", walk_off: 'WALK-OFF' });

/* Bases bitmask. */
const BASE = Object.freeze({ FIRST: 1, SECOND: 2, THIRD: 4 });

/* Count buckets the library is cut by. */
function countBucket(b, s) {
  if (s === 2) return 'two_strikes';
  if (b > s) return 'behind';         // the pitcher is behind
  if (s > b) return 'ahead';
  return 'even';
}

/* The daily. Eastern day, like every daily on the site. */
const ZONE = 'America/New_York';
const EPOCH = '2026-10-26';           // daily #1, set by the lead (2026-10-17)
function easternDay(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date || new Date());
}
function dayNumberOf(day) {
  const ms = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))
    - Date.UTC(+EPOCH.slice(0, 4), +EPOCH.slice(5, 7) - 1, +EPOCH.slice(8, 10));
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}
const DAILY_SEED_PREFIX = 'shut-the-door-';
const OUTING_KEY = 'std_outing_v1';

const SHARE_TITLE = 'Shut The Door';
const SHARE_URL = 'runthe.gg/shut-the-door';

const publicAPI = Object.freeze({
  API_VERSION, GRID, cellOf, rowOf, colOf, inZone, targetOf, cellAt, screenCol,
  PITCH_TYPES, SHAPE_OF, FAMILY_OF, BANDS, bandOf, SQUARE, SQUARES_PER_LINE,
  OUTCOMES, OUTCOME_RANK, OUTCOME_LABEL, BASE, countBucket,
  ZONE, EPOCH, easternDay, dayNumberOf, DAILY_SEED_PREFIX, OUTING_KEY,
  SHARE_TITLE, SHARE_URL,
});

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.STD_CONTRACT = publicAPI;
})();
