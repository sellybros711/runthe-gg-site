/* The share line, in the Arcade Lab's shape: a header, one strip of squares,
 * the url. One square per step of the play, the last one the shot. It links
 * the arcade, never this game's gated path, so a pasted result does not
 * hand a non-tester the route.
 *
 *   Last Shot WINNER 89-88 · 2.1
 *   ⬜🟦🟨🟩
 *   https://runthe.gg/arcade/
 */
export const SHARE_URL = 'https://runthe.gg/arcade/';
const SQ = { move: '⬜', screen: '🟦', pass: '🟨' };

export function squaresOf(play, res) {
  const out = [];
  for (const s of play.steps) {
    if (s.kind === 'shoot') continue;
    out.push(SQ[s.kind]);
  }
  if (res.how === 'turnover' || res.how === 'clock') out.push('⬛');
  else out.push(res.shot && res.shot.made ? '🟩' : '🟥');
  return out;
}

export function shareText(play, res) {
  const head = 'Last Shot ' + (res.outcome === 'win' ? 'WINNER' : 'LOSE') + ' ' + res.us + '-' + res.them + (res.shotAt != null ? ' · ' + res.shotAt.toFixed(1) : '');
  return head + '\n' + squaresOf(play, res).join('') + '\n' + SHARE_URL;
}
