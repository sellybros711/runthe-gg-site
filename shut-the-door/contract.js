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

/* The free aim point (the owner's call, 2026-10-22; CONTRACT.md 5d). A call
   may carry at: [u, v], where inside its cell the player aimed, as fractions
   of the cell's width and height, each -0.5..0.5, catcher's view: u toward
   the catcher's right (+x), v up (+zn). [0, 0] is the cell's centre, which is
   what a call without at aims at. Clamped to the cell and kept to two places,
   so a stored call replays exactly. It moves only where the ball is aimed:
   the cell still decides everything the grade, the scouting and the hitter's
   history read. */
const AIM = Object.freeze({ MAX: 0.5, STEPS: 100 });
function aimAt(at) {
  if (at == null) return null;
  if (!Array.isArray(at) || at.length !== 2 || !at.every(x => typeof x === 'number' && isFinite(x))) {
    throw new Error('an aim point at is [u, v], two numbers');
  }
  return at.map(x => Math.round(Math.max(-AIM.MAX, Math.min(AIM.MAX, x)) * AIM.STEPS) / AIM.STEPS + 0);
}
/* The point a call aims at: its cell's centre, moved by at. */
function aimPoint(cell, at) {
  const t = targetOf(cell);
  const a = aimAt(at);
  if (!a) return t;
  return { x: t.x + a[0] * GRID.COL_FT, zn: t.zn + a[1] * GRID.ROW_ZN };
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

/* The bright band (rules 4, the owner's call 2026-10-24: "if I have a good
   release it should go where I aimed"). A release at BEST_Q or over (the
   meter's bright band, meter.js BEST_Q, the same number) no longer scales his
   miss: it lands on the aim point plus a small miss of its own, PERFECT.SD_IN
   inches a side at BEST_Q down to PERFECT.SD_TOP_IN at q 1, never further than
   PERFECT.CAP_IN from the aim point, whatever the repeat, the effort or the
   arm. Aimed inside the zone, it never leaves the zone. A GAME RULE, not a
   measurement: the wider misses belong to good and ordinary releases, max
   effort and a tired arm. The same two miss draws, read as inches. A call
   under rules 3 or before plays spreadOf, exactly as it did. */
const PERFECT = Object.freeze({ BEST_Q: 0.85, SD_IN: 1.2, SD_TOP_IN: 0.6, CAP_IN: 3 });
function perfectLanding(aim, missX, missZ, q, zoneFt) {
  const r = releaseQ(q);
  const f = Math.max(0, Math.min(1, (r - PERFECT.BEST_Q) / (1 - PERFECT.BEST_Q)));
  const sd = PERFECT.SD_IN + (PERFECT.SD_TOP_IN - PERFECT.SD_IN) * f;
  let ox = missX * sd, oz = missZ * sd;
  const len = Math.sqrt(ox * ox + oz * oz);
  if (len > PERFECT.CAP_IN) { ox *= PERFECT.CAP_IN / len; oz *= PERFECT.CAP_IN / len; }
  let x = aim.x + ox / 12, zn = aim.zn + oz / 12 / zoneFt;
  if (Math.abs(aim.x) <= GRID.ZONE_HALF_FT && aim.zn >= 0 && aim.zn <= 1) {   // aimed in the zone: it stays in
    x = Math.max(-GRID.ZONE_HALF_FT, Math.min(GRID.ZONE_HALF_FT, x));
    zn = Math.max(0, Math.min(1, zn));
  }
  return { x, zn };
}

/* THE CALL (rules 4, 2026-10-24). A take is called by where the ball crossed,
   not by the cell it crossed in. zoneDist is the signed distance, in inches,
   from the zone's nearest edge: positive inside (the nearest of the two sides,
   the top and the bottom), negative outside (straight to the zone, round the
   corners). The zone is the one the grid draws: the plate's width plus a ball
   (GRID.ZONE_HALF_FT a side) and the batter's own height (zn 0..1, his
   Statcast zone, zoneFt tall).
   UMPIRE: DATA. The chance a taken pitch is called a strike at that distance,
   from every called pitch of the 2024 regular season (Baseball Savant, 375,000
   called balls and strikes, plate_x, plate_z, sz_top, sz_bot; the miss table's
   own geometry). Half-inch bins, straight between their centres: past six
   inches outside 0.0004, three inches inside 0.97, the heart near certain
   (a heart take called a ball 1 in 10,000 in 2024, 0.1% here). */
const UMPIRE = Object.freeze({
  D: Object.freeze([-6.25, -5.75, -5.25, -4.75, -4.25, -3.75, -3.25, -2.75, -2.25, -1.75, -1.25, -0.75, -0.25,
    0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75, 4.25, 4.75, 5.25, 5.75, 6.25, 6.75, 7.25, 7.75]),
  P: Object.freeze([0.0004, 0.0049, 0.0095, 0.0156, 0.0273, 0.0419, 0.0745, 0.1156, 0.1649, 0.2162, 0.3951, 0.4935, 0.6372,
    0.7343, 0.7985, 0.862, 0.9085, 0.9362, 0.9637, 0.9782, 0.9888, 0.9901, 0.9966, 0.9966, 0.9983, 0.9987, 0.9994, 0.9994, 1]),
});
function zoneDist(x, zn, zoneFt) {
  const dx = (GRID.ZONE_HALF_FT - Math.abs(x)) * 12;
  const dz = Math.min(zn, 1 - zn) * zoneFt * 12;
  if (dx >= 0 && dz >= 0) return Math.min(dx, dz);
  const ox = Math.min(0, dx), oz = Math.min(0, dz);
  return -Math.sqrt(ox * ox + oz * oz);
}
function calledStrikeP(d) {
  const D = UMPIRE.D, P = UMPIRE.P;
  if (d <= D[0]) return P[0];
  if (d >= D[D.length - 1]) return P[P.length - 1];
  let i = 0;
  while (d > D[i + 1]) i++;
  return P[i] + (P[i + 1] - P[i]) * (d - D[i]) / (D[i + 1] - D[i]);
}

/* ABS CHALLENGES (rules 4, MLB's 2026 rules). Each side has PER_SIDE a game
   (here, the outing); a challenge that wins is kept. Only a called ball or
   strike, only right away (before the next pitch). The ABS zone decides: the
   ball's actual location against the zone above (zoneDist >= 0 is a strike).
   The pitcher's side challenges a called ball with the player's button. The
   batter challenges a called strike by BATTER, a MODEL fitted to sourced
   rates: MLB's 2025 spring training ABS test (288 games: batters challenged
   2.1 a game, 4.4% of called strikes, and won 50%; the defense 2.0 a game,
   1.8% of called balls, 54%) and Triple-A in 2025 (batters won 45%). On the
   2024 called strikes above, his chance to challenge one m inches outside is
   min(MISS_MAX, MISS_A + MISS_B m), one d inches inside (a gamble)
   GAMBLE exp(-d / GAMBLE_IN), times TWO_STRIKES on strike three (the spring's
   full counts drew the most); that gives 4.4% of called strikes challenged and
   45% won. DEFENSE is the same shape fitted to the defense's numbers on the
   2024 called balls (1.9% challenged, 54% won), ball four for strike three. The
   closer pool and the strategy runs challenge by it; the player has the button. */
const ABS = Object.freeze({
  PER_SIDE: 2,
  BATTER: Object.freeze({ MISS_A: 0.02, MISS_B: 0.06, MISS_MAX: 0.9, GAMBLE: 0.1, GAMBLE_IN: 2, TWO_STRIKES: 1.5, MAX: 0.95 }),
  DEFENSE: Object.freeze({ MISS_A: 0, MISS_B: 0.34, MISS_MAX: 0.9, GAMBLE: 0.195, GAMBLE_IN: 1, TWO_STRIKES: 1.5, MAX: 0.95 }),
});
/* The chance a side challenges: m the inches the call was wrong by (> 0, a
   miss the ABS overturns) or right by (< 0, the ABS confirms). late: strike
   three for the batter, ball four for the defense. */
function challengeP(side, wrongBy, late) {
  const M = side === 'batter' ? ABS.BATTER : ABS.DEFENSE;
  const p = wrongBy > 0 ? Math.min(M.MISS_MAX, M.MISS_A + M.MISS_B * wrongBy) : M.GAMBLE * Math.exp(wrongBy / M.GAMBLE_IN);
  return Math.min(M.MAX, p * (late ? M.TWO_STRIKES : 1));
}

/* THE ROUTINE PLAY (rules 5, the owner's call 2026-10-25: "I don't want them
   to be completely error-free, but it should be extremely rare on a routine
   play"; CONTRACT.md 5g). A labelled game rule, read from the drawn real
   batted ball: its type (bb), exit speed (ev, mph), launch angle (la) and
   spray (degrees, 0 centre field, negative the left field side).
   - A routine grounder: a ground ball from GROUND_EV[0] up to (not including)
     GROUND_EV[1] mph, within FIELDER_DEG of a fielder's spot (FIELDERS: third,
     short, second, first, where the 2024 grounders between 60 and 95 mph went
     for hits least often). Under 50 mph is the slow roller and its bang-bang
     throw, 95 and up is hard hit (Statcast), between the spots is the hole.
   - A routine fly: a fly ball at LA FLY_LA or higher from FLY_EV[0] up to
     FLY_EV[1] mph (2024: hits on 1-6% of them). Every popup is routine.
   - A ball with no tracked speed (the 2010-2012 library) is judged as the
     scene draws it, by its type and spray: a grounder at a fielder, a fly ball
     and a popup are routine.
   Line drives, diving plays, hard-hit balls and balls in the hole are never
   routine and keep their real rates. KEEP: the share of a routine error that
   still happens (2024 Savant, regular season: a routine grounder was an error
   1 per 44, a routine fly or popup 1 per 364; KEEP makes each about 1 per
   1,000 or rarer). The rest are the cell's real out of the same kind
   (grade.js routineRow). */
const ROUTINE = Object.freeze({
  GROUND_EV: Object.freeze([50, 95]),
  FIELDERS: Object.freeze([-38, -19, 18, 42]),
  FIELDER_DEG: 6,
  FLY_LA: 30,
  FLY_EV: Object.freeze([80, 95]),
  KEEP: Object.freeze({ ground: 0.04, air: 0.2 }),
});
/* 'ground', 'air' or null: whether a batted ball is a routine play, and what kind. */
function routineOf(bb, ev, la, spray) {
  if (bb === 'popup') return 'air';
  if (bb === 'ground') {
    if (spray == null || !ROUTINE.FIELDERS.some(f => Math.abs(spray - f) <= ROUTINE.FIELDER_DEG)) return null;
    return ev == null || (ev >= ROUTINE.GROUND_EV[0] && ev < ROUTINE.GROUND_EV[1]) ? 'ground' : null;
  }
  if (bb === 'fly') {
    if (ev == null && la == null) return 'air';
    return ev != null && la != null && la >= ROUTINE.FLY_LA && ev >= ROUTINE.FLY_EV[0] && ev < ROUTINE.FLY_EV[1] ? 'air' : null;
  }
  return null;
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
  API_VERSION, GRID, cellOf, rowOf, colOf, inZone, targetOf, AIM, aimAt, aimPoint, cellAt, screenCol,
  PITCH_TYPES, SHAPE_OF, FAMILY_OF, BANDS, bandOf, SQUARE, SQUARES_PER_LINE,
  OUTCOMES, OUTCOME_RANK, OUTCOME_LABEL, RELEASE, releaseQ, spreadOf, PERFECT, perfectLanding,
  UMPIRE, zoneDist, calledStrikeP, ABS, challengeP, ROUTINE, routineOf, EFFORT, effortE, stuffAt, BASE, countBucket,
  ZONE, EPOCH, easternDay, dayNumberOf, dayOffsetOf, DAILY_SEED_PREFIX, OUTING_KEY,
  SHARE_TITLE, SHARE_URL,
});

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.STD_CONTRACT = publicAPI;
})();
