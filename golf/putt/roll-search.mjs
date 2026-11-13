/* golf/putt/roll-search.mjs: choose each hole's roll (putt.js ROLLS, roll()).

   node golf/putt/roll-search.mjs 1 2 3 ...      prints "main:N SEED" for each hole it can roll, "main:N none" otherwise

   For a hole with no slope of its own, it tries seeds 1 to 12 and keeps the first whose obvious route (the solver's, never
   through a secret) takes as many putts as the hole's recorded route does now, so the hole keeps its par, and on a hole with a
   secret line, that line still saves a stroke. A hole that already has a tilt, a tier, a crown or a mound away from its cup is
   left as it was. The chosen seeds go into ROLLS; then solve.mjs --write records the routes over the new carpet. */
import { createRequire } from 'node:module'; import fs from 'node:fs';
const require = createRequire(import.meta.url), P = require('./putt.js');
const S = await import('./solve.mjs'), R = JSON.parse(fs.readFileSync(new URL('./routes.json', import.meta.url)));
const tid = process.env.TOUR || 'main', TR = P.TOURS[tid];
function sloped(C){ return (C.comps || []).some(c => c.k === 'plane' || c.k === 'ridge' || c.k === 'crown' || c.k === 'ring' || c.k === 'ramp'
  || (c.k === 'mound' && Math.hypot(c.x - C.cup[0], c.y - C.cup[1]) > 2.5)); }
for (const n of process.argv.slice(2).map(Number)){ const key = tid + ':' + n, L = TR.levels[n - 1];
  delete P.ROLLS[key]; const C0 = P.buildLevel(n, tid);
  if (sloped(C0)){ console.log(key, 'sloped'); continue; }
  const want = (R[key] || []).length, avoid = (C0.secret || []).length > 0; let got = null;
  for (let seed = 1; seed <= 12 && !got; seed++){ P.ROLLS[key] = seed; const C = P.buildLevel(n, tid);
    const r = S.solve(C, want, null, avoid); if (!r.line || r.strokes !== want) continue;
    if (avoid){ const s = S.solve(C, want - 1); if (!s.line) continue; }
    got = seed; }
  delete P.ROLLS[key]; console.log(key, got == null ? 'none' : got); }
process.exit(0);
