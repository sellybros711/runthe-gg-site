/* Run The Arcade — next-game funnel for end modals (shared).
 *
 * Every game's end modal ships a generic "More games" link back to the hub.
 * This module upgrades it into a specific pull: "Next: Daily Match →" pointing
 * at the first game you haven't played today, plus a small "N of 9 played"
 * progress line. Finishing one puzzle should hand you the next one — that
 * hand-off is the whole session-extending trick of a games suite.
 *
 * Integration: just include the script. It finds the modal's `a[href="/arcade/"]`
 * on DOM ready and re-renders every time the end modal (#scrim) opens, so the
 * count is live even after replays. No per-game markup needed. If anything it
 * expects is missing it silently leaves the generic link alone.
 */
(function () {
  'use strict';
  var GAMES = [
    ['table', 'HiQ'],
    ['match', 'Daily Match'],
    ['career', 'Career Path'],
    ['oddone', 'Odd One Out'],
    ['rankit', 'Rank It'],
    ['almamater', 'Alma Mater'],
    ['guess', 'Guess the Player'],
    ['crossword', 'Daily Crossword'],
    ['wordsearch', 'Word Search']
  ];

  function currentGame() {
    var m = location.pathname.match(/\/arcade\/([a-z]+)\//);
    return m ? m[1] : null;
  }
  function playedToday(key) {
    try { return !!(window.RTGTokens && RTGTokens.playsOf && RTGTokens.playsOf(key) > 0); }
    catch (e) { return false; }
  }

  var styled = false;
  function injectCSS() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent = '.funprog{font-size:10.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--mut,#8aa0b8);margin:10px 0 -4px;}';
    (document.head || document.documentElement).appendChild(s);
  }

  function apply() {
    var link = document.querySelector('.sheet a[href="/arcade/"], a.abtn[href="/arcade/"]');
    if (!link) return;
    var cur = currentGame();
    var played = 0, next = null;
    GAMES.forEach(function (g) {
      var done = g[0] === cur || playedToday(g[0]);   // the game you're IN counts as played
      if (done) played++;
      else if (!next) next = g;
    });
    injectCSS();
    var prog = document.getElementById('funProg');
    if (!prog) {
      prog = document.createElement('div');
      prog.className = 'funprog'; prog.id = 'funProg';
      var row = link.parentNode;
      if (row && row.parentNode) row.parentNode.insertBefore(prog, row);
    }
    if (next) {
      prog.textContent = played + ' of ' + GAMES.length + ' played today';
      link.setAttribute('href', '/arcade/' + next[0] + '/');
      link.innerHTML = 'Next: ' + next[1] + ' <span aria-hidden="true">→</span>';
    } else {
      prog.textContent = 'Clean sweep — all ' + GAMES.length + ' played!';
      link.setAttribute('href', '/arcade/');
      link.textContent = 'Back to the arcade';
    }
  }

  function watch() {
    apply();
    var scrim = document.getElementById('scrim');
    if (scrim && window.MutationObserver) {
      new MutationObserver(function () {
        if (!scrim.classList.contains('hidden')) apply();
      }).observe(scrim, { attributes: true, attributeFilter: ['class'] });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
