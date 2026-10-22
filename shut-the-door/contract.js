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

/* The end of an outing (CONTRACT.md section 8). tie_held is the owner's call
   (2026-10-20): a run that ties no longer ends it, and three outs with the
   game still tied is a held tie. It is a blown save, so it ranks under
   door_shut and never counts toward the streak. The label lives here only, so
   it can be renamed in one place. */
const OUTCOMES = Object.freeze(['door_shut', 'tie_held', 'doors_open', 'walk_off']);
const OUTCOME_RANK = Object.freeze({ door_shut: 3, tie_held: 2, doors_open: 1, walk_off: 0 });
const OUTCOME_LABEL = Object.freeze({ door_shut: 'DOOR SHUT', tie_held: 'HELD THE TIE', doors_open: "DOOR'S OPEN", walk_off: 'WALK-OFF' });

/* The release (the owner's call, 2026-10-22). A call may carry q, the release
   quality from the timing meter, 0..1. It scales the pitch's miss (sigmaFt):
   q 1 is a perfect release at SPREAD_BEST of his miss, q 0 a bad one at
   SPREAD_WORST, and Q_AVG is exactly his own miss (1.0x), the closer pool's.
   Linear on each side of Q_AVG. A call without q is 1.0x, so every outing
   stored before the meter replays unchanged. The meter off throws Q_AVG.
   q is kept to two places (STEPS), so a stored call replays exactly. The
   grade never reads q: it prices the call at his own command. */
const RELEASE = Object.freeze({ Q_AVG: 0.5, SPREAD_BEST: 0.6, SPREAD_WORST: 1.5, STEPS: 100, REPEAT_KEEP: 0.5 });
function releaseQ(q) {
  if (q == null) return null;
  if (typeof q !== 'number' || !isFinite(q) || q < 0 || q > 1) throw new Error('a release q is a number 0..1');
  return Math.round(q * RELEASE.STEPS) / RELEASE.STEPS;
}
/* repeat (rules 2, the owner's call 2026-10-22): how many pitches in a row
   before this one were the same type. A good release on a repeat helps less:
   the tightening below 1.0x keeps REPEAT_KEEP of itself per repeat (0.6x, then
   0.8x, 0.9x at best). A game rule on the meter, not a measurement. A bad
   release costs the same, and the meter off (no q) is 1.0x either way. */
function spreadOf(q, repeat) {
  if (q == null) return 1;
  const r = releaseQ(q);
  if (r === RELEASE.Q_AVG) return 1;
  if (r < RELEASE.Q_AVG) return 1 + (RELEASE.SPREAD_WORST - 1) * (RELEASE.Q_AVG - r) / RELEASE.Q_AVG;
  let keep = 1;
  for (let i = 0; i < (repeat | 0); i++) keep *= RELEASE.REPEAT_KEEP;   // a product, not Math.pow: the same bits on every device
  return 1 - (1 - RELEASE.SPREAD_BEST) * keep * (r - RELEASE.Q_AVG) / (1 - RELEASE.Q_AVG);
}

/* Effort (the owner's call, 2026-10-22; CONTRACT.md 5c). A call may carry e,
   the meter's first stop, 0..1, kept to two places. 0 is his softest, 1 his
   hardest, MID (0.5) his ordinary pitch: a call with e 0.5 plays exactly like
   a call without e except for the speed it shows. e only rides with a timed
   release (q), since its cost is a smaller window on the meter's second stop.
   What e does lives in grade.js EFFORT (the pitch and the arm) and meter.js
   (the window). The grade never reads this pitch's e: like q, it prices the
   call at his ordinary stuff. */
const EFFORT = Object.freeze({ MID: 0.5, STEPS: 100 });
function effortE(e) {
  if (e == null) return null;
  if (typeof e !== 'number' || !isFinite(e) || e < 0 || e > 1) throw new Error('an effort e is a number 0..1');
  return Math.round(e * EFFORT.STEPS) / EFFORT.STEPS;
}

/* What a pitch looks like at effort e: his own real pitches of that type,
   from the pack (arsenal[i].stuff, pipeline/effort.py): the mean speed (mph)
   and break (pfx inches, catcher's view) of each fifth of his velocity,
   slowest first. e walks those five points (0 the slowest fifth, 0.5 the
   middle, 1 the fastest), straight between them. Without e, or for a pack
   with no stuff, it is his arsenal average. src: 'his' (his own pitches),
   'league' (too few of his own: his average plus the league's spread), or
   'average' (the arsenal's own numbers). One place, so the speed the UI
   shows is the speed the engine reports. */
function stuffAt(a, e) {
  const s = a && a.stuff;
  const ee = effortE(e);
  if (!s || ee == null || !Array.isArray(s.velo) || s.velo.length !== 5) {
    return { velo: a.velo, pfxX: a.pfxX, pfxZ: a.pfxZ, src: 'average' };
  }
  const pos = ee * 4, i = Math.min(3, Math.floor(pos)), f = pos - i;
  const at = arr => Math.round((arr[i] * (1 - f) + arr[i + 1] * f) * 10) / 10;
  return { velo: at(s.velo), pfxX: at(s.pfxX), pfxZ: at(s.pfxZ), src: s.src };
}

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
/* Days from the epoch: 0 on EPOCH, negative before it (the preview days before launch). */
function dayOffsetOf(day) {
  const ms = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))
    - Date.UTC(+EPOCH.slice(0, 4), +EPOCH.slice(5, 7) - 1, +EPOCH.slice(8, 10));
  return Math.round(ms / 86400000);
}
function dayNumberOf(day) {
  return Math.max(1, dayOffsetOf(day) + 1);
}
const DAILY_SEED_PREFIX = 'shut-the-door-';
const OUTING_KEY = 'std_outing_v1';

const SHARE_TITLE = 'Shut The Door';
const SHARE_URL = 'runthe.gg/shut-the-door';

const publicAPI = Object.freeze({
  API_VERSION, GRID, cellOf, rowOf, colOf, inZone, targetOf, cellAt, screenCol,
  PITCH_TYPES, SHAPE_OF, FAMILY_OF, BANDS, bandOf, SQUARE, SQUARES_PER_LINE,
  OUTCOMES, OUTCOME_RANK, OUTCOME_LABEL, RELEASE, releaseQ, spreadOf, EFFORT, effortE, stuffAt, BASE, countBucket,
  ZONE, EPOCH, easternDay, dayNumberOf, dayOffsetOf, DAILY_SEED_PREFIX, OUTING_KEY,
  SHARE_TITLE, SHARE_URL,
});

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.STD_CONTRACT = publicAPI;
})();
