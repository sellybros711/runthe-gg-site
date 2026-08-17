/* Run The Arcade - next-game funnel for end modals (shared).
 *
 * Every game's end modal ships a generic "More games" link back to the hub.
 * This module upgrades it into a specific pull: "Next: Common Ground →" pointing
 * at the first game you haven't played today, plus a small "N of 9 played"
 * progress line. Finishing one puzzle should hand you the next one - that
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
    ['table', 'Number Game'],
    ['match', 'Common Ground'],
    ['career', 'Career Path'],
    ['oddone', 'Odd One Out'],
    ['rankit', 'Rank It'],
    ['almamater', 'Alma Mater'],
    ['guess', 'Guess the Player'],
    ['crossword', 'Daily Crossword'],
    ['sportegories', 'Sportegories'],
    ['highlow', 'High Low']
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
    s.textContent = '.funprog{font-size:10.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--mut,#8aa0b8);margin:10px 0 -4px;}' +
      '.funrow{display:flex;gap:18px;justify-content:center;align-items:center;flex-wrap:wrap;margin:10px 0 0;}' +
      '.funhome,.funlb{display:inline-block;margin:0;background:none;border:0;font:800 12px var(--f,system-ui);color:var(--mut,#8aa0b8);cursor:pointer;text-decoration:underline;text-underline-offset:3px;}' +
      '.funhome:hover,.funlb:hover{color:var(--ink,#F4F7FB);}' +
      // Guest notice: says what actually happened to the score, and offers the
      // one action that changes it. Quiet, not a second paywall.
      '.funguest{display:flex;align-items:center;justify-content:center;gap:9px;flex-wrap:wrap;' +
      'margin:12px 0 0;padding:10px 12px;border:1px solid var(--line2,rgba(255,255,255,.15));' +
      'border-radius:11px;background:var(--card2,rgba(255,255,255,.04));}' +
      '.funguest span{font-size:11.5px;font-weight:700;color:var(--mut,#8aa0b8);line-height:1.35;}' +
      '.funguest button{background:none;border:0;padding:0;cursor:pointer;' +
      'font:900 11.5px var(--f,system-ui);color:var(--brandT,var(--coralT,#FF8A3D));' +
      'text-decoration:underline;text-underline-offset:3px;white-space:nowrap;}';
    (document.head || document.documentElement).appendChild(s);
  }

  function apply() {
    // First apply() rewrites the link's href to the next game, so later
    // applies can't find it by href again (and must never grab our own
    // home link, which also points at /arcade/). Mark it once, find it by
    // the marker forever after.
    var link = document.querySelector('[data-fun-link]') ||
               document.querySelector('.sheet a[href="/arcade/"]:not(.funhome), a.abtn[href="/arcade/"]:not(.funhome)');
    if (!link) return;
    link.setAttribute('data-fun-link', '1');
    var cur = currentGame();
    // Only offer what this player can actually open next. Handing a free
    // account "Next: Career Path" when Career Path is an Arcade Card game sends
    // them to a wall, and counts a game they can never punch toward a total
    // they can never reach.
    var pool = GAMES.filter(function (g) {
      try { return !(window.RTGTokens && RTGTokens.cardOnly && RTGTokens.cardOnly(g[0])); }
      catch (e) { return true; }
    });
    if (!pool.length) pool = GAMES;
    var played = 0, next = null;
    pool.forEach(function (g) {
      var done = g[0] === cur || playedToday(g[0]);   // the game you're IN counts as played
      if (done) played++;
      else if (!next) next = g;
    });
    injectCSS();
    /* Where to hang our own elements. Most games wrap the modal buttons in a
       row div, so we sit outside that wrapper. Sportegories puts its buttons
       straight on the sheet, and inserting "outside the wrapper" there means
       outside the modal entirely — the row rendered off-screen. Anchor on the
       wrapper only when there is one. */
    var sheetEl = link.closest ? link.closest('.sheet, .modal') : null;
    var anchor = (link.parentNode && link.parentNode !== sheetEl) ? link.parentNode : link;
    var prog = document.getElementById('funProg');
    if (!prog) {
      prog = document.createElement('div');
      prog.className = 'funprog'; prog.id = 'funProg';
      if (anchor.parentNode) anchor.parentNode.insertBefore(prog, anchor);
    }
    // The specific next-game link replaced the generic hub link, so restore a
    // way home: a quiet text link under the button row (skipped on a clean
    // sweep, where the main link already points at the hub).
    // A "Back to the arcade" + "Leaderboard" row sits under the button row.
    // Leaderboard closes the result modal and scrolls to today's board (which
    // is revealed once the game is finished).
    var rowEl = document.getElementById('funRow');
    if (!rowEl) {
      rowEl = document.createElement('div'); rowEl.className = 'funrow'; rowEl.id = 'funRow';
      if (anchor.parentNode) anchor.parentNode.insertBefore(rowEl, anchor.nextSibling);
      var h = document.createElement('a');
      h.className = 'funhome'; h.id = 'funHome'; h.setAttribute('href', '/arcade/'); h.textContent = 'Back to the arcade';
      var lb = document.createElement('button');
      lb.type = 'button'; lb.className = 'funlb'; lb.id = 'funLb'; lb.textContent = 'Leaderboard';
      lb.addEventListener('click', showBoard);
      rowEl.appendChild(h); rowEl.appendChild(lb);
    }
    guestNotice(rowEl);
    var home = document.getElementById('funHome');
    if (next) {
      prog.textContent = played + ' of ' + pool.length + ' played today';
      link.setAttribute('href', '/arcade/' + next[0] + '/');
      link.innerHTML = 'Next: ' + next[1] + ' <span aria-hidden="true">→</span>';
      if (home) home.style.display = '';
    } else {
      prog.textContent = 'Clean sweep! All ' + pool.length + ' played!';
      link.setAttribute('href', '/arcade/');
      link.textContent = 'Back to the arcade';
      if (home) home.style.display = 'none';   // the main button is the way home
    }
  }
  /* A guest and a cardholder used to get byte-identical result screens — same
     streak, same "best ever", same Leaderboard button. But board.js submits
     nothing without a session (grid_submit_run refuses anonymous callers), so
     a guest was being shown a board they are not on and a streak that lives
     only in this browser, with nothing saying so.
     One line, stating both facts, plus the action that fixes them. Signed-in
     players never see it — their score really is posted. */
  function isGuest() {
    try { return !!(window.RTGTokens && RTGTokens.signedIn) && !RTGTokens.signedIn(); }
    catch (e) { return false; }
  }
  function guestNotice(rowEl) {
    var have = document.getElementById('funGuest');
    if (!isGuest()) { if (have) have.remove(); return; }
    if (have || !rowEl || !rowEl.parentNode) return;
    var box = document.createElement('div');
    box.className = 'funguest'; box.id = 'funGuest';
    var msg = document.createElement('span');
    msg.textContent = 'Playing as a guest — this score stays on this device and isn’t on the leaderboard.';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = 'Sign in to post it';
    btn.addEventListener('click', function () {
      try { if (window.RTGAuthUI && RTGAuthUI.open) { RTGAuthUI.open('signup'); return; } } catch (e) {}
      location.href = '/arcade/';
    });
    box.appendChild(msg); box.appendChild(btn);
    rowEl.parentNode.insertBefore(box, rowEl.nextSibling);
  }

  // close the result overlay and reveal today's leaderboard rail
  function showBoard() {
    try {
      var s = document.getElementById('scrim'); if (s) s.classList.add('hidden');
      var r = document.getElementById('resultModal'); if (r) r.setAttribute('hidden', '');
      document.body.style.overflow = '';
      var lb = document.querySelector('.lb, .mlb');
      if (lb) lb.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}
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
