#!/usr/bin/env node
/* Roll-Ball tuning probe. Plays the real sim with simulated players:
 *   good:   aims for a home run pocket, aim sd 0.022 rad, power sd 0.035
 *   steady: aims for the triple, aim sd 0.03, power sd 0.05
 *   casual: aims at the middle of the rings with a much shakier hand
 * and reports the zone mix. The target in the brief: a good player lands a
 * home run about one throw in three, a casual one mostly singles and doubles.
 *
 *   node functions/_arcadelab/build/tune-rollball.mjs [runs]
 */
import { create, throwBall, step, pocketAt } from '../games/rollball/sim.js';
import { CONFIG as C, LAYOUTS } from '../games/rollball/config.js';
import { mulberry32 } from '../shared/seed.js';

const RUNS = +process.argv[2] || 300;
const gauss = r => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); };

/* Where a throw lands with no jitter, by stepping the real sim with a seed
   whose jitter we then cancel: cheaper to just search over the real sim. */
function restOf(seed, a, p, wait) {
  const s = create(seed);
  for (let i = 0; i < wait; i++) step(s);
  throwBall(s, a, p);
  while (s.phase !== 'settle') step(s);
  return { x: s.x, y: s.y, zone: s.results[0].zone, frame: s.frame };
}
/* Best (a,p) for a target point, searched on a jitter free copy. */
const CACHE = new Map();
function aimFor(tx, ty) {
  const k = tx.toFixed(1) + ',' + ty.toFixed(1);
  if (CACHE.has(k)) return CACHE.get(k);
  let best = null;
  for (let a = -0.4; a <= 0.4; a += 0.004) for (let p = 0.2; p <= 1; p += 0.004) {
    const v = C.V_MIN + p * (C.V_MAX - C.V_MIN);
    // analytic lane: straight line, friction
    const dy = C.LIP_Y, dist = dy / Math.cos(a), x = dy * Math.tan(a);
    if (Math.abs(x) > C.LANE_HALF) continue;
    const v2 = v * v - 2 * C.LANE_FRICTION * dist; if (v2 <= C.MIN_LIP_SPEED ** 2) continue;
    const sp = Math.sqrt(v2), carry = sp * C.CARRY_S;
    const lx = x + carry * Math.sin(a), ly = dy + carry * Math.cos(a);
    const rv = sp * C.ROLL_KEEP, roll = rv * rv / (2 * C.BOARD_FRICTION);
    const fx = lx + roll * Math.sin(a), fy = ly + roll * Math.cos(a);
    const e = Math.hypot(fx - tx, fy - ty);
    if (!best || e < best.e) best = { a, p, e };
  }
  CACHE.set(k, best); return best;
}

function play(kind, seedBase) {
  const tally = { '1B': 0, '2B': 0, '3B': 0, HR: 0, F: 0 }; let total = 0; const scores = [];
  for (let n = 0; n < RUNS; n++) {
    const seed = (seedBase + n * 7919) >>> 0, r = mulberry32(seed ^ 0xabc);
    const s = create(seed); const L = s.layout;
    while (!s.over) {
      if (s.phase === 'ready') {
        let tx, ty;
        if (kind === 'good') { const pk = L.pockets[s.ball % 2]; const c = pocketAt(pk, s.frame + 60); tx = c.x; ty = c.y - 2; }
        else if (kind === 'steady' || kind === 'goodtri') { tx = L.ring.x; ty = L.ring.y; }
        else { tx = L.ring.x; ty = L.ring.y; }
        const aim = aimFor(tx, ty);
        const sa = kind === 'good' || kind === 'goodtri' ? 0.022 : kind === 'steady' ? 0.03 : 0.06;
        const sp = kind === 'good' || kind === 'goodtri' ? 0.035 : kind === 'steady' ? 0.05 : 0.10;
        const a = Math.max(-C.MAX_ANGLE, Math.min(C.MAX_ANGLE, aim.a + gauss(r) * sa));
        const p = Math.max(0, Math.min(1, aim.p + gauss(r) * sp));
        throwBall(s, a, p);
      }
      step(s);
    }
    for (const x of s.results) tally[x.zone]++;
    total += s.score; scores.push(s.score);
  }
  const n = RUNS * C.BALLS;
  console.log(kind.padEnd(7), Object.entries(tally).map(([k, v]) => k + ' ' + (100 * v / n).toFixed(1) + '%').join('  '), ' mean score', (total / RUNS).toFixed(1), ' p90', scores.sort((a, b) => a - b)[Math.floor(RUNS * 0.9)], ' best', scores[RUNS - 1]);
}
play('good', 1); play('goodtri', 4); play('steady', 2); play('casual', 3);
