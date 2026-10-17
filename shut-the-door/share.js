/* Shut The Door: the share text (CONTRACT.md section 11). window.STD_SHARE.
 *
 *   Shut The Door #12
 *   door shut · better than 71% of closers
 *   pitched like Josh Hader
 *   🟩🟩🟨🟩🟧🟩
 *   runthe.gg/shut-the-door
 *
 * Every word and number comes from the result and contract.js (the title, the
 * squares, ten to a line, the URL). Node: require('./share.js').text(...).
 */
(function () {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const C = NODE ? require('./contract.js') : window.STD_CONTRACT;

  const OUTCOME_WORDS = { door_shut: 'door shut', doors_open: "door's open", walk_off: 'walk-off' };

  function text(result, dailyNumber) {
    const r = result || {};
    const lines = [C.SHARE_TITLE + ' #' + dailyNumber];
    const pct = r.percentile == null ? null : Math.round(r.percentile);
    lines.push(OUTCOME_WORDS[r.outcome] + (pct == null ? '' : ' · better than ' + pct + '% of closers'));
    if (r.pitchedLike && r.pitchedLike.name) lines.push('pitched like ' + r.pitchedLike.name);
    const sq = (r.strip || []).map((b) => C.SQUARE[b] || '');
    for (let i = 0; i < sq.length; i += C.SQUARES_PER_LINE) lines.push(sq.slice(i, i + C.SQUARES_PER_LINE).join(''));
    lines.push(C.SHARE_URL);
    return lines.join('\n');
  }

  const api = { API_VERSION: 1, text };
  if (NODE) module.exports = api;
  if (typeof window !== 'undefined') window.STD_SHARE = api;
})();
