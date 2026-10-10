/* Every Arcade Lab game, and the flag that switches it on.
 *
 * A game is visible to testers only while its flag is 'testers' (or 'public',
 * a future launch). All six ship 'off', which leaves them visible to admins
 * alone. Adding a game is one row here plus one row in arcade_lab_flags.
 */
import * as rollball from './games/rollball/sim.js';

export const GAMES = Object.freeze({
  'roll-ball': { id: 'roll-ball', flag: 'arcade_roll_ball', name: 'Roll-Ball', path: '/arcade/lab/roll-ball/', dir: 'rollball',
    desc: 'Roll nine balls. Land them in the rings. Rack up bases.', sim: rollball }
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
