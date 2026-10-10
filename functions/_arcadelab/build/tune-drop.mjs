#!/usr/bin/env node
/* Drop Board: how much does the drop position matter?
 * For each slot, drops aimed at the middle of that slot across many seeds:
 * how often it lands there, one off, or further. Then three strategies on
 * the same boards: always the middle, at random, and aiming at the best
 * value. node functions/_arcadelab/build/tune-drop.mjs [seeds] */
import * as S from '../games/dropboard/sim.js';
import { CONFIG as C } from '../games/dropboard/config.js';
import { mulberry32 } from '../shared/seed.js';
const N = +process.argv[2] || 300, SW = C.WIDTH / C.SLOTS;
function land(seed, x, theme) { const s = S.create(seed, theme ? { theme } : null); S.applyInput(s, { f: 0, x }); while (s.phase === 'fall' || s.phase === 'ready') S.step(s); return s.results[0].slot; }
const hist = { 0: 0, 1: 0, 2: 0, 3: 0 }; let frames = 0;
for (let n = 0; n < N; n++) for (let k = 0; k < C.SLOTS; k++) { const d = Math.abs(land(1000 + n, (k + 0.5) * SW) - k); hist[Math.min(3, d)]++; }
const tot = N * C.SLOTS;
console.log('aimed at a slot:', Object.entries(hist).map(([d, v]) => (d === '3' ? '3+' : d) + ' off ' + (100 * v / tot).toFixed(0) + '%').join('  '));
const theme = { slots: [5, 10, 20, 40, 80, 160, 320].map(v => ({ label: '' + v, value: v })) };
const strat = { middle: 0, random: 0, aimed: 0 };
for (let n = 0; n < N; n++) {
  const seed = 5000 + n, r = mulberry32(seed);
  for (const k of Object.keys(strat)) {
    const s = S.create(seed, { theme });
    const vals = s.L.slots.map((x, i) => x.value * (i === s.L.double ? 2 : 1)), best = vals.indexOf(Math.max(...vals));
    while (!s.over) { if (s.phase === 'ready') S.applyInput(s, { f: s.frame, x: k === 'middle' ? 50 : k === 'random' ? 6 + r() * 88 : Math.max(5, Math.min(95, (best + 0.5) * SW)) }); S.step(s); frames += 1; }
    strat[k] += (s.score - s.worst) / (s.best - s.worst);
  }
}
console.log('share of the best possible:', Object.entries(strat).map(([k, v]) => k + ' ' + (100 * v / N).toFixed(0) + '%').join('  '));
console.log('mean frames a run', Math.round(frames / N / 3), '(' + (frames / N / 3 / 60).toFixed(1) + 's of play)');
