#!/usr/bin/env node
/* How often a sensible drawn play converts, by distance.
 *
 *   node 4th-and-what/build/tune.mjs [seeds] [--plays]
 *
 * A small playbook a fair coach might draw (quick game, a concept with a
 * checkdown, a deep shot, two runs), each snapped against `seeds` defenses
 * (default 400) at every distance. It prints each play's conversion rate and
 * the playbook's average, beside the target: rough NFL 4th down conversion by
 * distance (1: 65%, 3: 55%, 5: 45%, 7: 38%, 10: 28%, 15: 18%; the old
 * RunTheDrive notes only sanity check short runs at about 62% and long
 * yardage at 32 to 41%, with their own selection bias warning).
 *
 * The averages are recorded in the vault (games/4th-and-what/4th-and-what-formulas.md).
 * Change a number in config.js, run this, update the note. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../engine.js'), C = require('../config.js');

export const PLAYBOOK = {
  'sneak': { formation: 'uc12', routes: [], blocks: [{ who: 'TE', to: [5, -0.5] }], handoff: { to: 'QB', path: [[0, 1.5], [0, 4]] }, targets: [] },
  'inside zone': { formation: 'iform', routes: [], blocks: [{ who: 'TE', to: [-1.5, -1] }], handoff: { to: 'RB', path: [[-1, -3], [-1.6, 0.5], [-1.8, 6]] }, targets: [] },
  'slant flat': { formation: 'gun2x2', routes: [{ who: 'WR1', pts: [[-13.5, 1.5], [-9.5, 5.5]] }, { who: 'SLOT', pts: [[-8.5, 1], [-12.5, 3]] }, { who: 'WR2', pts: [[13.5, 1.5], [9.5, 5.5]] }, { who: 'TE', pts: [[8.5, 1], [12.5, 3]] }], blocks: [{ who: 'RB', to: [-2, -4] }], handoff: null, targets: ['WR1', 'SLOT'] },
  'mesh': { formation: 'gun3x1', routes: [{ who: 'SLOT', pts: [[-9.5, 4], [4, 5.5]] }, { who: 'TE', pts: [[-6.2, 5], [9, 6.5]] }, { who: 'WR1', pts: [[-13.5, 12], [-13.5, 10]] }, { who: 'WR2', pts: [[13.5, 9], [16, 6]] }, { who: 'RB', pts: [[4, -3], [8, 1]] }], blocks: [], handoff: null, targets: ['TE', 'RB'] },
  'stick': { formation: 'gun3x1', routes: [{ who: 'TE', pts: [[-6.2, 6], [-6, 5]] }, { who: 'SLOT', pts: [[-9.5, 2], [-15, 3]] }, { who: 'WR1', pts: [[-13.5, 20]] }, { who: 'WR2', pts: [[13.5, 10], [11, 9]] }], blocks: [{ who: 'RB', to: [2, -4] }], handoff: null, targets: ['TE', 'SLOT'] },
  'curls': { formation: 'empty', routes: [{ who: 'WR1', pts: [[-13.5, 13], [-12.5, 11]] }, { who: 'WR2', pts: [[13.5, 13], [12.5, 11]] }, { who: 'SLOT', pts: [[-9.5, 9], [-8, 7]] }, { who: 'TE', pts: [[8.5, 9], [7, 7]] }, { who: 'RB', pts: [[-5.5, 3]] }], blocks: [], handoff: null, targets: ['WR1', 'RB'] },
  'dig': { formation: 'gun2x2', routes: [{ who: 'WR1', pts: [[-13.5, 16], [-3, 17]] }, { who: 'SLOT', pts: [[-8.5, 24]] }, { who: 'WR2', pts: [[13.5, 19], [14.5, 17]] }, { who: 'TE', pts: [[8.5, 4], [1, 5]] }, { who: 'RB', pts: [[-4, -3], [-7, 2]] }], blocks: [], handoff: null, targets: ['WR1', 'TE'] },
  'deep shot': { formation: 'gun3x1', routes: [{ who: 'WR1', pts: [[-13.5, 30]] }, { who: 'WR2', pts: [[13.5, 12], [9, 20]] }, { who: 'SLOT', pts: [[-9.5, 6], [-4, 9]] }], blocks: [{ who: 'TE', to: [-5, -2] }, { who: 'RB', to: [2, -4] }], handoff: null, targets: ['WR1', 'SLOT'] }
};
/* which plays a fair coach would actually call at each distance */
const SENSIBLE = {
  1: ['sneak', 'inside zone', 'slant flat', 'stick'],
  3: ['inside zone', 'slant flat', 'stick', 'mesh'],
  5: ['slant flat', 'stick', 'mesh', 'curls'],
  7: ['mesh', 'curls', 'slant flat', 'dig'],
  10: ['curls', 'dig', 'mesh', 'deep shot'],
  15: ['dig', 'deep shot', 'curls']
};
const TARGET = { 1: 65, 3: 55, 5: 45, 7: 38, 10: 28, 15: 18 };

export function rate(play, distance, seeds, tuning) {
  let w = 0;
  for (let s = 1; s <= seeds; s++) if (E.run(Object.assign({}, C.SCENARIO, { distance }), play, s * 7919, { tuning }).win) w++;
  return w / seeds;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const seeds = +(process.argv.find(a => /^\d+$/.test(a)) || 400), showPlays = process.argv.includes('--plays');
  const rows = [];
  for (const d of C.DISTANCES) {
    const per = {};
    for (const name of Object.keys(PLAYBOOK)) per[name] = rate(PLAYBOOK[name], d, seeds);
    const avg = SENSIBLE[d].reduce((a, n) => a + per[n], 0) / SENSIBLE[d].length;
    rows.push({ d, avg: Math.round(avg * 100), target: TARGET[d], per });
  }
  console.log('distance  sensible avg  target');
  for (const r of rows) console.log(String(r.d).padStart(8) + '  ' + (r.avg + '%').padStart(12) + '  ' + (r.target + '%').padStart(6));
  if (showPlays) {
    console.log('\nplay' + ' '.repeat(12) + C.DISTANCES.map(d => String(d).padStart(5)).join(''));
    for (const name of Object.keys(PLAYBOOK)) console.log(name.padEnd(16) + rows.map(r => (Math.round(r.per[name] * 100) + '%').padStart(5)).join(''));
  }
  console.log(JSON.stringify(rows.map(r => [r.d, r.avg])));
}
