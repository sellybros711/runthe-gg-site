/* 4th and What: the share line.
 *
 * The Arcade Lab's shape (functions/_arcadelab/shared/share.js), which Last
 * Shot uses too: a header with the result, one strip of squares, the url. No
 * spoilers: the squares say how far it went against how far it needed, never
 * what was drawn.
 *
 *   4th and What FIRST DOWN +9 · 4th and 7
 *   🟩🟩🟩🟩🟩🟩🟩🏁
 *   https://runthe.gg/4th-and-what
 *
 * One square a yard needed: green for a yard gained, white for one short,
 * then a flag for a conversion or a cross for a stop.
 *
 * Plain script: window.FAW_SHARE, module.exports in node.
 */
(function (root) {
  'use strict';
  var URL_ = 'https://runthe.gg/4th-and-what';
  var WORD = { sack: 'SACKED', throwaway: 'THROWN AWAY', incomplete: 'INCOMPLETE', fumble: 'FUMBLE' };

  function text(r) {
    var need = Math.min(15, r.distance), got = Math.max(0, Math.min(need, r.win ? need : r.yards));
    var sq = '';
    for (var i = 0; i < need; i++) sq += i < got ? '🟩' : '⬜';
    sq += r.win ? '🏁' : '❌';
    var y = r.yards > 0 ? '+' + r.yards : String(r.yards);
    var line = WORD[r.outcome] ? (r.outcome === 'sack' ? 'SACKED ' + y : WORD[r.outcome]) : r.title + ' ' + y;
    return '4th and What ' + line + ' · ' + r.down + '\n' + sq + '\n' + URL_;
  }

  async function send(t) {
    var nav = root.navigator;
    if (nav && nav.share) { try { await nav.share({ text: t }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; } }
    try { await nav.clipboard.writeText(t); return 'copied'; } catch (e) { return 'failed'; }
  }

  var API = { text: text, send: send, URL: URL_ };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.FAW_SHARE = API;
})(typeof window !== 'undefined' ? window : this);
