#!/usr/bin/env node
/* Where can an award be trusted? For each award, take the players a STRONGER
 * honour proves should hold it (an MVP or Hall of Famer was nearly always an
 * All-Star) and count how many the dataset is missing it for. A big miss rate
 * means the award goes on CONFIG.AWARD_COVERAGE as null.
 *
 *   node functions/_stumpire/build/audit-fields.mjs
 */
import { store } from '../entities.js';
const E = store().list.filter(e => e.k === 'p');
const RULES = [
  ['MLB', 'MLB All-Star', ['MLB MVP', 'Cy Young', 'Hall of Fame'], 1940],
  ['NBA', 'NBA All-Star', ['NBA MVP', 'Finals MVP', 'Hall of Fame'], 1960],
  ['NFL', 'Pro Bowl', ['NFL MVP', 'Hall of Fame', 'Offensive Player of the Year', 'Defensive Player of the Year'], 1970]
];
for (const [lg, award, proof, from] of RULES) {
  const c = E.filter(e => e.s === lg && (e.dc || []).some(d => d >= from) && (e.aw || []).some(a => proof.includes(a)));
  const miss = c.filter(e => !(e.aw || []).includes(award));
  console.log(lg + ' ' + award + ': ' + miss.length + ' of ' + c.length + ' proven holders missing (' + (100 * miss.length / c.length).toFixed(1) + '%)');
  console.log('   ' + miss.slice(0, 15).map(e => e.n).join(', '));
}
