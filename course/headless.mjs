#!/usr/bin/env node
/* Run The Course: shifts with no renderer.
 *
 *   node course/headless.mjs --shifts 20            play 20 shifts in a row, print each
 *   node course/headless.mjs --shifts 20 --idle     nobody at the controls
 *   node course/headless.mjs --seed 7 --json
 *
 * The player is the goal line bot (bot.js). Exits 1 if any group was stuck
 * (moved on by the watchdog) or cut off at closing, so CI can hold
 * "twenty shifts, zero stuck groups". Used for balancing too. */
import { CONFIG } from './config.js';
import { MAP } from './map.js';
import { newCourse, startShift, step, endShift, makeCtx, replay } from './sim.js';
import { makeBot } from './bot.js';

export function runShifts({ shifts = 20, seed = 1, idle = false, cfg = CONFIG, map = MAP, course = null, check = false } = {}) {
  let c = course || newCourse(cfg, map, seed);
  const out = [];
  for (let i = 0; i < shifts; i++) {
    const ctx = makeCtx(c, cfg, map), S = startShift(c, cfg, map), bot = makeBot();
    const t0 = performance.now();
    while (!S.done) { if (!idle) bot(S, ctx); step(S, ctx); }
    const ms = performance.now() - t0;
    const end = endShift(S, ctx, c);
    if (check) {
      const again = replay(c, S.log, cfg, map);
      if (!again || again.result.checksum !== end.result.checksum) throw new Error('shift ' + S.no + ': the replay disagrees with the shift');
    }
    out.push({ ...end.result, ms: Math.round(ms * 100) / 100, logLen: S.log.length, logBytes: JSON.stringify(S.log).length });
    c = end.course;
  }
  return { course: c, results: out };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*[\\/]/, ''))) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
  const has = k => process.argv.includes('--' + k);
  const { course, results } = runShifts({ shifts: +arg('shifts', 20), seed: +arg('seed', 1), idle: has('idle'), check: true });
  if (has('json')) console.log(JSON.stringify({ course, results }, null, 1));
  else {
    console.log('shift  rounds golfers  cash  tips  walkoffs  avg round  low  stars  goal   cash after  stuck cut   ms');
    for (const r of results) {
      console.log(String(r.no).padStart(5), String(r.rounds).padStart(6), String(r.golfers).padStart(7), ('$' + r.cash).padStart(6), ('$' + r.tips).padStart(5),
        String(r.walkOffs).padStart(8), (r.avgRoundS + 's').padStart(10), String(r.low || '-').padStart(4), r.stars.toFixed(2).padStart(6),
        (r.goalMet ? 'met ' : 'miss') + ('$' + r.goal).padStart(5), ('$' + r.cashAfter).padStart(9), String(r.stuck).padStart(6), String(r.cutOff).padStart(3), String(r.ms).padStart(6));
    }
  }
  const stuck = results.reduce((a, r) => a + r.stuck, 0), cut = results.reduce((a, r) => a + r.cutOff, 0);
  console.log(results.length + ' shifts. Stuck groups: ' + stuck + '. Cut off at closing: ' + cut + '. Every replay matched.');
  if (stuck || cut) process.exit(1);
}
