/* Run The Course: a player who only reads the goal line.
 *
 * The bot does what the goal line says and nothing else: it walks to the
 * goal's spot (tap to travel) and taps Leave when told to. The headless
 * script, the tests and the browser check all drive a shift with it, which
 * is how "a new player finishes the first shift guided only by the goal
 * line" is held: if the goal line stops being enough, the bot fails first. */
import { command, goalOf } from './sim.js?v=4';

export function makeBot() {
  let key = null, gx = 0, gy = 0;
  return function bot(S, ctx) {
    const g = goalOf(S, ctx);
    if (g.act === 'exit') { if (S.player.mode !== 'walk') command(S, 'exit'); key = null; return; }
    const moved = (g.x - gx) * (g.x - gx) + (g.y - gy) * (g.y - gy) > 0.25;
    if (g.key !== key || moved || (!S.player.go && S.tick % 10 === 0 && (S.player.x - g.x) * (S.player.x - g.x) + (S.player.y - g.y) * (S.player.y - g.y) > 1)) {
      key = g.key; gx = g.x; gy = g.y;
      command(S, 'goto', Math.round(g.x * 10) / 10, Math.round(g.y * 10) / 10);
    }
  };
}
