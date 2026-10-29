#!/usr/bin/env node
/* Hoop Shoot tuning probe: plays the real sim with simulated shooters who
 * know the right power for where the hoop is, with a shaky hand, shooting
 * every `gap` frames. Brief's target: a competent player makes 22 to 30.
 *   node functions/_arcadelab/build/tune-hoop.mjs [runs] */
import * as S from '../games/hoopshoot/sim.js';
import { CONFIG as C } from '../games/hoopshoot/config.js';
import { mulberry32 } from '../shared/seed.js';
const RUNS = +process.argv[2] || 40;
const gauss = r => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); };

/* The best clean (a, p) for a hoop at hx, searched on the real sim. */
const cache = new Map();
function ideal(hx) {
  const k = Math.round(hx * 20) / 20;
  if (cache.has(k)) return cache.get(k);
  let best = null;
  for (let p = 0.2; p <= 1; p += 0.005) {
    const v = C.V_MIN + p * (C.V_MAX - C.V_MIN), vh = v * Math.cos(C.ELEVATION), vz = v * Math.sin(C.ELEVATION);
    const a = Math.atan2(k, C.HOOP_Y);
    const dist = Math.hypot(k, C.HOOP_Y), t = dist / vh, z = C.RELEASE_Z + vz * t - C.GRAVITY * t * t / 2;
    const e = Math.abs(z - C.RIM_Z) + (vz - C.GRAVITY * t > 0 ? 5 : 0);
    if (!best || e < best.e) best = { a, p, e };
  }
  cache.set(k, best); return best;
}
function play(name, sa, sp, gap, lead) {
  let made = 0, shots = 0, score = 0, swish = 0;
  for (let n = 0; n < RUNS; n++) {
    const seed = 900 + n * 31, r = mulberry32(seed * 7 + 1), s = S.create(seed);
    let next = 30;
    while (!s.over) {
      if (s.frame >= next && s.frame < C.CLOCK_FRAMES) {
        const hx = S.hoopX(s.day, s.frame + lead);
        const id = ideal(hx);
        if (S.applyInput(s, { f: s.frame, a: Math.max(-C.MAX_AIM, Math.min(C.MAX_AIM, id.a + gauss(r) * sa)), p: Math.max(0, Math.min(1, id.p + gauss(r) * sp)) })) next = s.frame + gap;
      }
      S.step(s);
    }
    made += s.made; shots += s.shots; score += s.score; swish += s.log.filter(l => l.kind === 'swish').length;
  }
  console.log(name.padEnd(10), 'shots', (shots / RUNS).toFixed(1), 'made', (made / RUNS).toFixed(1), (100 * made / shots).toFixed(0) + '%', 'swish', (swish / RUNS).toFixed(1), 'score', (score / RUNS).toFixed(1));
}
play('sharp', 0.008, 0.012, 70, 50);
play('competent', 0.015, 0.02, 80, 50);
play('casual', 0.03, 0.04, 90, 30);
