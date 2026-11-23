/* The share line, in the Arcade Lab's shape: a header, one strip of squares,
 * the url. One square per step of the play, the last one the shot. It links
 * the game itself (before the launch it linked the arcade, so a pasted
 * result did not hand a non-tester the route).
 *
 *   Last Shot WINNER 89-88 · 2.1
 *   (a tie that went to overtime: Last Shot WINNER 88-88 OT · 2.1)
 *   ⬜🟦🟨🟩
 *   https://runthe.gg/last-shot/
 */
export const SHARE_URL = 'https://runthe.gg/last-shot/';
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
  const head = 'Last Shot ' + (res.outcome === 'win' ? 'WINNER' : 'LOSE') + ' ' + res.us + '-' + res.them + (res.how === 'ot' ? ' OT' : '') + (res.shotAt != null ? ' · ' + res.shotAt.toFixed(1) : '');
  return head + '\n' + squaresOf(play, res).join('') + '\n' + SHARE_URL;
}

/* The Daily's share line: the number, the stars as squares, the score's own
 * words, the game's url. Never the defense or the play, so it spoils nothing.
 *
 *   Last Shot #35
 *   ⭐⭐⬛
 *   Won · 2 stars · 64% look
 *   https://runthe.gg/last-shot/
 */
export function dailyShareText(dayNumber, squares, scoreText) {
  return 'Last Shot #' + dayNumber + '\n' + (Array.isArray(squares) ? squares.join('') : '') + '\n' + scoreText + '\n' + SHARE_URL;
}
