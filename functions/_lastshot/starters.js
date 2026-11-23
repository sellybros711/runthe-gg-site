/* STARTER PLAYS (the owner, 2026-11-13). Four named plays a coach knows,
 * one tap from the clipboard. Each is legal from the default down 1, works,
 * and has its own answer to the defense, so Test it has something to show:
 *
 *   Pin-down             beats going under. A zone takes it away.
 *   Floppy               the shooter picks his side. Beats man, not a zone.
 *   Horns Twist          two ball screens, the big rolls. Holds up against all.
 *   Spain pick and roll  a back screen frees the roller. Beats a switch.
 *
 * Measured 2026-11-13 (150 seeds a defense) and held by test/starters.test.mjs.
 * Steps carry beat 1: one storyboard frame. */
import { SCENARIO } from './scenario.js';

const P = (x, y) => ({ x, y });
const one = steps => steps.map(s => ({ ...s, beat: 1 }));

export const STARTERS = Object.freeze([
  {
    id: 'pin-down', name: 'Pin-down', note: 'O5 pins for O2. A three off the curl. Best when they go under.',
    play: { goAt: 6, spots: SCENARIO.spots, steps: one([
      { kind: 'screen', who: 'O5', pts: [P(35, 10.5)] },
      { kind: 'move', who: 'O2', pts: [P(33.5, 9), P(38, 14), P(43, 23)] },
      { kind: 'pass', from: 'O1', to: 'O2' },
      { kind: 'shoot', who: 'O2' }]) }
  },
  {
    id: 'floppy', name: 'Floppy', note: 'O2 starts under the rim and comes off the stack. Beats man. Not a zone.',
    play: { goAt: 6, spots: { O1: P(25, 31), O2: P(25, 4), O3: P(34, 7), O4: P(17, 8), O5: P(32, 8.5) }, steps: one([
      { kind: 'screen', who: 'O5', pts: [P(33, 10)] },
      { kind: 'move', who: 'O2', pts: [P(30, 6), P(36, 12), P(43, 22)] },
      { kind: 'pass', from: 'O1', to: 'O2' },
      { kind: 'shoot', who: 'O2' }]) }
  },
  {
    id: 'horns-twist', name: 'Horns Twist', note: 'O4 screens, then O5 screens back the other way and rolls. Works on anybody.',
    play: { goAt: 8, spots: { O1: P(25, 31), O2: P(46, 4), O3: P(4, 4), O4: P(19, 19.5), O5: P(31, 19.5) }, steps: one([
      { kind: 'screen', who: 'O4', pts: [P(22.5, 28.5)] },
      { kind: 'move', who: 'O1', pts: [P(21, 30), P(18, 25)] },
      { kind: 'screen', who: 'O5', pts: [P(22, 23)] },
      { kind: 'move', who: 'O1', pts: [P(23, 22), P(28, 19)] },
      { kind: 'move', who: 'O5', pts: [P(25, 9)] },
      { kind: 'pass', from: 'O1', to: 'O5' },
      { kind: 'shoot', who: 'O5' }]) }
  },
  {
    id: 'spain', name: 'Spain pick and roll', note: 'O5 picks, O2 back screens his man, O5 rolls free. Beats a switch.',
    play: { goAt: 8, spots: SCENARIO.spots, steps: one([
      { kind: 'screen', who: 'O5', pts: [P(27, 28.5)] },
      { kind: 'move', who: 'O1', pts: [P(31, 28), P(34, 24)] },
      { kind: 'screen', who: 'O2', pts: [P(26, 22)] },
      { kind: 'move', who: 'O5', pts: [P(25, 9)] },
      { kind: 'pass', from: 'O1', to: 'O5' },
      { kind: 'shoot', who: 'O5' }]) }
  }
]);

export const starterById = id => STARTERS.find(s => s.id === id) || null;

/* A fresh copy to put on the clipboard. */
export const starterPlay = id => {
  const s = starterById(id);
  return s ? JSON.parse(JSON.stringify(s.play)) : null;
};
