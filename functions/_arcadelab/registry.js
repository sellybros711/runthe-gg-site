/* Every Arcade Lab game, and the flag that switches it on.
 *
 * A game is visible to testers only while its flag is 'testers' (or 'public',
 * a future launch). 134 created all six 'off'; 135 turned them to 'testers'.
 * Adding a game is one row here plus one row in arcade_lab_flags.
 */
import * as rollball from './games/rollball/sim.js';
import * as fieldgoal from './games/fieldgoal/sim.js';
import * as hoopshoot from './games/hoopshoot/sim.js';
import * as whack from './games/whack/sim.js';
import * as dropboard from './games/dropboard/sim.js';
import * as pinball from './games/pinball/sim.js';

/* content: the game plays a published, editor approved slate (see content/)
   rather than a day derived from the seed alone. */
export const GAMES = Object.freeze({
  'roll-ball': { id: 'roll-ball', flag: 'arcade_roll_ball', name: 'Roll-Ball', path: '/arcade/lab/roll-ball/', dir: 'rollball',
    desc: 'Roll nine balls. Land them in the rings. Rack up bases.', sim: rollball },
  'field-goal-flick': { id: 'field-goal-flick', flag: 'arcade_field_goal_flick', name: 'Field Goal Flick', path: '/arcade/lab/field-goal-flick/', dir: 'fieldgoal',
    desc: 'Five kicks. Read the wind. Flick it through.', sim: fieldgoal },
  'hoop-shoot': { id: 'hoop-shoot', flag: 'arcade_hoop_shoot', name: 'Hoop Shoot', path: '/arcade/lab/hoop-shoot/', dir: 'hoopshoot',
    desc: '60 seconds. Swipe to shoot. Hit the money ball.', sim: hoopshoot },
  'whack': { id: 'whack', flag: 'arcade_whack_right_player', name: 'Whack the Right Player', path: '/arcade/lab/whack/', dir: 'whack',
    desc: 'Hit every player who fits. Leave the rest alone.', sim: whack, content: 'whack' },
  'drop-board': { id: 'drop-board', flag: 'arcade_drop_board', name: 'Drop Board', path: '/arcade/lab/drop-board/', dir: 'dropboard',
    desc: 'Pick your drop. Hope it lands on the big one.', sim: dropboard, content: 'drop' },
  'pinball': { id: 'pinball', flag: 'arcade_pinball', name: 'Pinball', path: '/arcade/lab/pinball/', dir: 'pinball',
    desc: 'Three balls. Light the bases, hit the ramp.', sim: pinball }
});

/* The flags that exist, built or not, so the table and the gate agree. */
export const FLAGS = Object.freeze(['arcade_roll_ball', 'arcade_field_goal_flick', 'arcade_hoop_shoot',
  'arcade_whack_right_player', 'arcade_drop_board', 'arcade_pinball']);

/* Who may see a game: 'admin', 'tester', 'player' (public mode) or null.
   The same rule as stumpire_access(): an admin always, a tester while the
   flag is on, anybody only once it is public. */
export function accessFor(role, flag) {
  if (role === 'admin') return 'admin';
  if (!flag || flag === 'off') return null;
  if (role === 'tester') return 'tester';
  return flag === 'public' ? 'player' : null;
}
