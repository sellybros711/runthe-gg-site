#!/usr/bin/env node
/* HOW OFTEN A PERSON GOES IN THE WATER.
 *
 *   node golf/putt/fair.mjs --tour main            every hole
 *   node golf/putt/fair.mjs --tour main --only 8,73
 *
 * The solver proves a hole CAN be beaten. It says nothing about what happens to a player who is a couple
 * of degrees off, which is everybody: a line that threads lava with no rail beside it is beatable and
 * miserable. So this plays each putt of the recorded obvious route the way a person does, with the aim a
 * little out (2 degrees, one standard deviation), the pace a little out (8%) and, on a moving hole, the
 * moment a little out (0.12 s), and reports how often that putt ends in the water or off the course.
 * The noise is seeded, so a number moves only when the hole does.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { shot } from './solve.mjs';
const require = createRequire(import.meta.url);
const P = require(process.env.PUTT_SRC || './putt.js');

export const NOISE = { aim:2 * Math.PI / 180, pace:0.08, t:0.12 };
function gauss(r){ let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* for each putt of the line: the share of noisy versions that end wet or out */
export function hazardRates(C, line, N = 160){
  const out = []; let x = C.tee[0], y = C.tee[1];
  line.forEach(([ang, ft, t0], i) => {
    const r = rng(9001 + i * 77); let bad = 0;
    for (let k = 0; k < N; k++){ const s = shot(C, x, y, ang + gauss(r) * NOISE.aim, Math.max(1, ft * (1 + gauss(r) * NOISE.pace)), Math.max(0, t0 + gauss(r) * NOISE.t)); if (s.water || s.out) bad++; }
    out.push(bad / N);
    const s = shot(C, x, y, ang, ft, t0); if (s.rest){ x = s.rest[0]; y = s.rest[1]; } });
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('fair.mjs')){
  const args = process.argv.slice(2), tour = args.includes('--tour') ? args[args.indexOf('--tour') + 1] : 'main', TR = P.TOURS[tour];
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map(Number) : null;
  const ROUTES = JSON.parse(fs.readFileSync(new URL('./routes.json', import.meta.url), 'utf8'));
  let sum = 0, cnt = 0;
  for (let n = 1; n <= TR.levels.length; n++){ if (only && !only.includes(n)) continue;
    const line = ROUTES[tour + ':' + n]; if (!line) { console.log(String(n).padStart(3), 'no route'); continue; }
    const hz = hazardRates(P.buildLevel(n, tour), line), worst = Math.max(...hz); sum += worst; cnt++;
    console.log(String(n).padStart(3), P.levelName(n, tour).padEnd(22), 'par', TR.levels[n - 1].par, '  wet or out:', hz.map(h => (h * 100).toFixed(0).padStart(3) + '%').join(' '), worst > 0.25 ? '  HARSH' : '');
  }
  console.log(`\nmean worst putt: ${(sum / Math.max(1, cnt) * 100).toFixed(1)}% wet or out`);
}
