#!/usr/bin/env node
/* Daily Defense's schedule: which play, at which distance, each day.
 *
 *   node 4th-and-what/build/trivia.mjs [days]      (default 400)
 *
 * Walks the pool (every concept on every formation, both ways, in a fixed
 * shuffle: trivia.js) and gives each a 4th down distance that suits it: a
 * run at 1 to 4, a pass at 3 to 10, a sneak only at 1 or 2. A day is kept
 * only when the question has an answer: the engine, snapped 100 times
 * against each of the seven calls, finds one or two calls clearly best (the
 * best and the worst at least SPREAD apart, at most two calls within the
 * tie of the best). The page still answers each day live with the day's
 * own seeds, so a retune moves the answer with it.
 *
 * Writes 4th-and-what/data/defense.json: [{ concept, set, side, distance }].
 * Re-run after a retune if the answers look thin, then bump defense.json's
 * ?v= in trivia.js. Never reorder days that are live.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const Tr = require('../trivia.js'), RNG = require('../rng.js');
const DAYS = +(process.argv[2] || 400), SPREAD = 0.15;

const P = Tr.pool();
function distanceOf(it, k) {
  const r = RNG.hashStr('faw-defense-build-' + k);
  if (it.concept === 'QB Sneak') return 1 + r % 2;
  if (it.kind === 'run') return 1 + r % 4;
  return [3, 4, 5, 6, 7, 8, 10][r % 7];
}
const out = [];
let k = 0, tried = 0;
while (out.length < DAYS && tried < DAYS * 6) {
  const it = P[k % P.length], d = distanceOf(it, k); k++; tried++;
  const sc = Tr.scenarioFor('2026-01-01'); sc.distance = d;
  const rates = Tr.solve(sc, it.play, 'build-' + k);
  const v = Tr.CALLS.map((c) => rates[c]), best = Math.min(...v), worst = Math.max(...v);
  const near = v.filter((x) => x <= best + Tr.TIE).length;
  if (worst - best < SPREAD || near > 2) continue;
  out.push({ concept: it.concept, set: it.set, side: it.side, distance: d });
  if (out.length % 25 === 0) console.log(out.length, 'days from', tried, 'tried');
}
const file = path.join(HERE, '..', 'data', 'defense.json');
fs.writeFileSync(file, JSON.stringify({ built: 'trivia.mjs', spread: SPREAD, days: out }) + '\n');
console.log('wrote', out.length, 'days from', tried, 'tried to', path.relative(process.cwd(), file));
