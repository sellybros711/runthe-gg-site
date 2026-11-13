/* THE LADDER (the owner, 2026-11-13). 24 situations in four chapters, three
 * stars each. A level is a situation (clock, down), a starting set, and
 * sometimes a defense the scout already told you about. Nothing here changes
 * how the sim plays: a level only picks the scenario and, for a known
 * defense, forces the scheme after the roll (simulate's opt.scheme).
 *
 * Stars grade the play, not the bounce:
 *   1  you won
 *   2  and the look was open (the shot's make chance was LOOK or better)
 *   3  and it went up with CLUTCH or less on the clock, as the play (not a
 *      heave at the bail-out mark)
 * No stars for a loss, however good the look. A level with a short clock
 * keeps the same rule: that is what makes 4.0 left hard.
 *
 * Every level is checked winnable by test/levels.test.mjs. */
import { SCENARIO } from './scenario.js';
import { scenarioFor } from './playbook.js';

export const LOOK = 0.5;
export const CLUTCH = 3.0;

const P = (x, y) => ({ x, y });
export const SETS = Object.freeze({
  box: SCENARIO.spots,
  horns: { O1: P(25, 31), O2: P(46, 4), O3: P(4, 4), O4: P(19, 19.5), O5: P(31, 19.5) },
  high14: { O1: P(25, 32), O2: P(44, 22), O3: P(6, 22), O4: P(18.5, 19.5), O5: P(31.5, 19.5) },
  out41: { O1: P(25, 31), O2: P(43, 22), O3: P(4, 4), O4: P(7, 22), O5: P(31, 7) }
});

const L = (id, chapter, title, sit, set, scheme) => Object.freeze({ id, chapter, title, sit: Object.freeze(sit), set, scheme: scheme || null });

export const CHAPTERS = Object.freeze([
  { id: 1, name: 'Down 1', note: 'Any bucket in the last 5 seconds wins.' },
  { id: 2, name: 'Down 2', note: 'A two ties it. Overtime is a coin flip. A three wins.' },
  { id: 3, name: 'Zones', note: 'The scout says zone. Find the gap.' },
  { id: 4, name: 'Down 3', note: 'Only a three ties it. Then overtime.' }
]);

export const LEVELS = Object.freeze([
  L('1-1', 1, 'Draw it up', { clock: 22 }, 'box'),
  L('1-2', 1, 'Spread the floor', { clock: 9 }, 'out41'),
  L('1-3', 1, 'Horns', { clock: 14 }, 'horns'),
  L('1-4', 1, 'Quick hitter', { clock: 5.5 }, 'high14'),
  L('1-5', 1, 'They switch everything', { clock: 22 }, 'box', 'switch'),
  L('1-6', 1, 'They go under', { clock: 18 }, 'box', 'under'),

  L('2-1', 2, 'Two to tie', { clock: 22, down: 2 }, 'box'),
  L('2-2', 2, 'Horns for three', { clock: 12, down: 2 }, 'horns'),
  L('2-3', 2, 'Spread them out', { clock: 6, down: 2 }, 'out41'),
  L('2-4', 2, 'They fight over', { clock: 20, down: 2 }, 'box', 'over'),
  L('2-5', 2, 'Wings up', { clock: 16, down: 2 }, 'high14'),
  L('2-6', 2, 'Five seconds', { clock: 5, down: 2 }, 'box'),

  L('3-1', 3, 'The 2-3', { clock: 20 }, 'box', 'zone23'),
  L('3-2', 3, 'The 1-3-1', { clock: 16 }, 'horns', 'zone131'),
  L('3-3', 3, 'The 3-2', { clock: 12 }, 'high14', 'zone32'),
  L('3-4', 3, 'Match-up', { clock: 18 }, 'out41', 'matchup'),
  L('3-5', 3, 'Zone, down 2', { clock: 8, down: 2 }, 'box', 'zone23'),
  L('3-6', 3, 'Zone at the horn', { clock: 4.5 }, 'horns', 'zone32'),

  L('4-1', 4, 'Need three', { clock: 22, down: 3 }, 'box'),
  L('4-2', 4, 'Horns, three', { clock: 10, down: 3 }, 'horns'),
  L('4-3', 4, 'Spread, need three', { clock: 8, down: 3 }, 'out41'),
  L('4-4', 4, 'They switch, need three', { clock: 18, down: 3 }, 'out41', 'switch'),
  L('4-5', 4, 'Three on the 2-3', { clock: 14, down: 3 }, 'box', 'zone23'),
  L('4-6', 4, 'Last one', { clock: 7, down: 3 }, 'box')
]);

export const levelById = id => LEVELS.find(l => l.id === id) || null;

/* The scenario a level plays: the situation, with the set's spots. */
export function levelScenario(level, sc = SCENARIO) {
  const s = scenarioFor(sc, level.sit);
  return { ...s, spots: JSON.parse(JSON.stringify(SETS[level.set] || sc.spots)) };
}

/* The simulate options a level plays with. */
export const levelOpt = level => (level.scheme ? { scheme: level.scheme } : {});

/* 0 to 3. Reads the result only. */
export function starsOf(res) {
  if (!res || res.outcome !== 'win' || !res.shot) return 0;
  let n = 1;
  if (res.shot.p >= LOOK) n++; else return n;
  if (res.shotAt != null && res.shotAt <= CLUTCH && !res.shot.bailout) n++;
  return n;
}

/* What each star asks, for the level card. */
export const STAR_RULES = Object.freeze(['Win', 'Win with an open look', 'And let it go with ' + CLUTCH.toFixed(1) + ' or less']);
