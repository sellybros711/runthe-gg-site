/* Run The Arcade - one voice for every share card (shared).
 *
 * Before this, nine games hand-built nine slightly different share strings:
 * "Run The Arcade · Number Game", "Run The Arcade Daily Match, Aug 9",
 * "Run The Arcade Daily Crossword 2026-08-10"... different separators, some
 * with a date, some without, none with the one thing that makes a daily-puzzle
 * share travel: a PUZZLE NUMBER. "#142" is what lets two people know they
 * played the same board and turns a score into a collectible.
 *
 * RTGShare gives every game the same header, the same footer, the same copy
 * feedback, and a single fire() that also hands the challenge loop a clean
 * integer to compare - so the link it stamps is runthe.gg/arcade/table?vs=You&s=10
 * instead of the old ?from=You&m=1%20in%20a%20row.
 *
 * window.RTGShare. Everything guarded; a missing piece degrades, never throws.
 */
(function () {
  'use strict';

  var NAMES = {
    table: 'Number Game', match: 'Daily Match', career: 'Career Path',
    oddone: 'Odd One Out', rankit: 'Rank It', almamater: 'Alma Mater',
    guess: 'Guess the Player', crossword: 'Daily Crossword', wordsearch: 'Word Search'
  };

  // Days since the first archived puzzle, 1-indexed, computed in UTC so it
  // can't drift by a day across time zones. The archive's earliest day is
  // puzzle #1 - the same first board an Arcade Card unlocks - so the number a
  // card shows lines up with the vault. Sourced from RTGArchive.LAUNCH (the one
  // place that date lives) with a literal fallback for pages that load us
  // without the archive module.
  var EPOCH_ISO = '2026-07-22';
  function epoch() {
    try { if (window.RTGArchive && RTGArchive.LAUNCH) return RTGArchive.LAUNCH; } catch (e) {}
    return EPOCH_ISO;
  }
  function puzzleNo(dateIso) {
    var t = dateIso ? Date.parse(dateIso + 'T00:00:00Z') : NaN;
    var e = Date.parse(epoch() + 'T00:00:00Z');
    if (isNaN(t) || isNaN(e)) return null;
    var n = Math.floor((t - e) / 86400000) + 1;
    return n > 0 ? n : null;
  }

  function name(key) { return NAMES[key] || 'Run The Arcade'; }
  // Full https:// with a trailing slash on purpose: a bare "runthe.gg/..."
  // only auto-links in some apps and rarely triggers the rich link preview,
  // and the trailing slash is the canonical page (no redirect hop before the
  // OG card unfurls). This is the tappable link that carries the whole share.
  function url(key) { return 'https://runthe.gg/arcade/' + key + '/'; }

  // "Run The Arcade — Number Game #142". The em-dash reads as brand→game; the
  // number is dropped only if the date can't be parsed (never, in practice).
  function header(key, dateIso) {
    var no = puzzleNo(dateIso);
    return 'Run The Arcade — ' + name(key) + (no ? ' #' + no : '');
  }

  // Assemble the whole card from its three parts, so the blank-line rhythm and
  // the footer are identical everywhere:
  //   Run The Arcade — Number Game #142
  //   <grid>
  //   <stat line>
  //   runthe.gg/arcade/table
  function card(key, dateIso, opts) {
    opts = opts || {};
    var parts = [header(key, dateIso)];
    if (opts.grid) parts.push(opts.grid);
    if (opts.stat) parts.push(opts.stat);
    parts.push(url(key));
    return parts.join('\n');
  }

  // Consistent copy feedback for the clipboard fallback - the toast each game
  // rolled itself said something slightly different ("Copied to clipboard",
  // "Result copied", "Copied"). One line, one style.
  function note(msg) {
    try {
      var t = document.getElementById('rtgShareToast');
      if (!t) {
        var s = document.createElement('style');
        s.textContent = '#rtgShareToast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0));' +
          'transform:translateX(-50%) translateY(8px);z-index:9800;background:var(--ink,#0d1b2c);color:var(--bg,#fff);' +
          'font:800 13px/1 var(--f,system-ui,sans-serif);padding:11px 16px;border-radius:10px;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);' +
          'opacity:0;transition:opacity .18s,transform .18s;pointer-events:none;max-width:80vw;text-align:center;}' +
          '#rtgShareToast.on{opacity:1;transform:translateX(-50%) translateY(0);}';
        (document.head || document.documentElement).appendChild(s);
        t = document.createElement('div'); t.id = 'rtgShareToast'; t.setAttribute('role', 'status');
        document.body.appendChild(t);
      }
      t.textContent = msg;
      requestAnimationFrame(function () { t.classList.add('on'); });
      clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 2200);
    } catch (e) {}
  }

  // Send the card. `stat` is the one integer the challenge loop compares (runs,
  // sets, guesses, or seconds) - null when there's nothing beatable to offer
  // (a loss, an unfinished board). It's stashed where challenge.js's share
  // interceptor reads it, so the challenge link carries a clean &s=<int> and no
  // encoded prose. The Web Share sheet is tried first (best on mobile), then
  // the clipboard with a toast, then a last-resort message.
  function fire(text, stat) {
    try { window.RTGShareStat = (stat == null || (typeof stat === 'number' && isNaN(stat))) ? null : stat; } catch (e) {}
    try {
      if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(function () { note('Copied — paste it anywhere'); })
          .catch(function () { note('Copy failed'); });
        return;
      }
    } catch (e) {}
    note('Sharing isn’t supported here');
  }

  window.RTGShare = {
    NAMES: NAMES, name: name, url: url, puzzleNo: puzzleNo,
    header: header, card: card, fire: fire, note: note
  };
})();
