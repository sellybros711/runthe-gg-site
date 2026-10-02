/* gamehead.js: the in-game header on a phone (window.RTGGameHead).
 *
 * On a phone a game opened under three bands before the board: the site
 * banner (logo, plays left, account), the game's own header (back, name, ?,
 * sound, theme, streak) and a scoreboard (points today, a line of rules,
 * best). At 375x667 that pushed the bottom of most boards off the screen.
 *
 * So on a phone it is one row and one slim strip:
 *
 *   row     ‹ [mark] GAME NAME                        ?
 *   strip   STREAK 3 · TODAY 5 · BEST 12      2 left  [account]
 *
 * and the scoreboard keeps only its line of instruction, which becomes the
 * one line above the board. Sound and theme move into the ? sheet
 * (howto.js), next to the rules.
 *
 * NOTHING IS REBUILT. The streak chip, the plays-left pill and the account
 * button are the same nodes, moved, so every id the games and the banner
 * write to still lands. The points and best in the strip are mirrors of the
 * scoreboard's own numbers, kept in step by a MutationObserver, because the
 * games animate and restyle those elements and a moved node would carry that
 * into a 32px strip. Wider than a phone, everything goes back where it was.
 *
 * RTGGameHead.notice(text, opts) puts a one-line notice above the board, for
 * the free-play warning (pregame.js) that used to be a full screen.
 */
(function () {
  'use strict';

  function gameKey() { var m = (location.pathname || '').match(/\/arcade\/([a-z]+)\//); return m ? m[1] : null; }
  var GAME = gameKey();
  var KNOWN = { table:1, match:1, career:1, oddone:1, rankit:1, almamater:1, guess:1, crossword:1, sportegories:1, rollcall:1, chain:1, highlow:1 };
  if (!GAME || !KNOWN[GAME]) { window.RTGGameHead = { notice: function () {}, on: function () { return false; } }; return; }

  /* The scoreboard numbers each game shows, as [element id, label]. A game
     not listed keeps its own in-play status row (the crossword's clock, Common
     Ground's guesses, the timed games' tally), which is already one line. */
  var STATS = {
    career:    [['runN', 'Today'], ['bestRun', 'Best']],
    oddone:    [['runN', 'Today'], ['bestRun', 'Best']],
    almamater: [['runN', 'Today'], ['bestRun', 'Best']],
    table:     [['runN', 'Run'], ['bestRun', 'Best']],
    rankit:    [['runN', 'Tries'], ['bestRun', 'Best']]
  };
  /* One line of instruction for a game that had none above its board. The
     others already carry one (the scoreboard's line, a lead, a setup blurb). */
  var LINE = {
    crossword: { before: '.board-wrap', text: 'Tap a square and type. Tap it again to switch across and down.' }
  };

  var MQ = window.matchMedia ? window.matchMedia('(max-width: 600px)') : null;
  var on = false, strip = null, moved = [], obs = null, noticeEl = null;

  function $(s, root) { try { return (root || document).querySelector(s); } catch (e) { return null; } }
  function css() {
    if (document.getElementById('rtggh-css')) return;
    var s = document.createElement('style');
    s.id = 'rtggh-css';
    s.textContent = [
      /* the one-line instruction and the notice: shown at every width */
      '.rtggh-line{margin:0 0 10px;font-size:13px;font-weight:700;line-height:1.4;color:var(--mut);text-align:center;}',
      '.rtggh-notice{margin:0 0 10px;padding:8px 12px;border-radius:12px;font-size:13px;font-weight:700;line-height:1.4;',
      ' color:var(--ink);background:color-mix(in srgb, var(--gold,#F2B632) 14%, var(--card));',
      ' border:1px solid color-mix(in srgb, var(--gold,#F2B632) 45%, transparent);text-align:center;}',
      '.rtggh-notice a,.rtggh-notice button{font:inherit;font-weight:900;color:var(--goldT,#F2B632);background:none;border:0;padding:0;',
      ' text-decoration:underline;text-underline-offset:3px;cursor:pointer;}',
      /* ---- phone only from here ---- */
      'body.rtggh .rtg-topbanner{display:none !important;}',
      'html body.rtggh .topbar{flex-wrap:nowrap;padding:4px 0 6px;gap:6px;position:sticky;top:0;z-index:60;',
      ' background:var(--bg);box-shadow:0 8px 12px -12px rgba(0,0,0,.5);}',
      'html body.rtggh .topbar .brand.logo{flex:1 1 auto;}',
      'html body.rtggh .topbar .brand.logo .sub{font-size:19px;-webkit-line-clamp:1;white-space:nowrap;text-overflow:ellipsis;}',
      'html body.rtggh .gh-mark{width:32px;height:32px;border-radius:9px;}',
      'html body.rtggh .gh-mark svg{width:22px;height:22px;}',
      'html body.rtggh .topbar .themeBtn.rtgHowto-btn{width:44px;height:44px;border-radius:12px;border-left-width:1px;margin-left:auto;}',
      'body.rtggh .topbar [data-sound-toggle],body.rtggh .topbar #themeBtn{display:none !important;}',
      '.rtggh-strip{display:flex;align-items:center;gap:8px;margin:0 0 10px;min-height:34px;font-size:11px;font-weight:900;',
      ' letter-spacing:.06em;text-transform:uppercase;color:var(--mut);}',
      /* One line, always. A wrapped strip is a second header row, which is the
         thing this file exists to remove; on the narrowest phones the labels
         tighten instead. */
      '.rtggh-strip .rtggh-stats{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0;white-space:nowrap;overflow:hidden;}',
      '@media (max-width:389px){.rtggh-strip{letter-spacing:.02em;font-size:10px;gap:6px;} .rtggh-strip .rtggh-stats{gap:6px;} .rtggh-strip .rtggh-stat b{margin-left:3px;}}',
      '.rtggh-strip .rtggh-stat b{font-family:var(--hero,inherit);font-weight:400;font-size:16px;letter-spacing:0;color:var(--ink);margin-left:4px;font-variant-numeric:tabular-nums;}',
      '.rtggh-strip .rtggh-right{margin-left:auto;display:flex;align-items:center;gap:6px;flex:0 0 auto;}',
      'html body .rtggh-strip .chip{height:30px !important;flex-direction:row !important;gap:5px !important;padding:0 8px !important;border-radius:999px !important;}',
      'html body .rtggh-strip .chip .n{font-size:15px !important;}',
      'html body .rtggh-strip .chip .l{font-size:9px !important;}',
      /* the banner's pill and account button, out of the banner: its own rules
         are scoped to .rtg-topbanner, so they are restated here, smaller */
      '.rtggh-strip .rtb-tokens[hidden]{display:none;}',
      '.rtggh-strip .rtb-tokens,.rtggh-strip .rtb-prof{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;',
      ' border-radius:999px;border:1px solid var(--line2,rgba(244,247,251,.14));background:var(--card2,#162B44);color:var(--ink,#F4F7FB);',
      ' font-family:inherit;font-weight:800;font-size:11.5px;letter-spacing:0;text-transform:none;line-height:1;white-space:nowrap;cursor:pointer;}',
      '.rtggh-strip .rtb-tokens .tk-ic{width:14px;height:14px;flex:0 0 auto;color:var(--coralT,#F06A5F);}',
      '.rtggh-strip .rtb-tokens.unlimited{color:var(--brandT,#FF8A3D);border-color:color-mix(in srgb,var(--brandT,#FF8A3D) 55%,transparent);}',
      '.rtggh-strip .rtb-tokens.unlimited .tk-ic{color:var(--brandT,#FF8A3D);}',
      '.rtggh-strip .rtb-prof{padding:0 4px;min-width:30px;justify-content:center;max-width:44px;overflow:hidden;}',
      '.rtggh-strip .rtb-prof.out{padding:0 10px;max-width:none;}',
      '.rtggh-strip .rtb-prof:not(.out) .rtb-plab{display:none;}',
      '.rtggh-strip .rtb-prof svg{width:16px;height:16px;flex:0 0 auto;}',
      '.rtggh-strip .rtb-prof .rtb-av{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--coral,#F06A5F),#F0913C);',
      ' color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;}',
      /* ---- each board on one screen at 375x667 ---- */
      'body.rtggh .modesw:not(:empty){margin-bottom:8px !important;}',
      'html body.rtggh .modesw:not(:empty) button{min-height:32px;}',
      'body.rtggh-career .prompt,body.rtggh-almamater .prompt,body.rtggh-oddone .prompt{font-size:14px;margin:0 0 6px;}',
      'body.rtggh-career .pathcard{padding:10px 12px !important;margin-bottom:10px;}',
      'body.rtggh-career .pathcard .plab{margin-bottom:6px;}',
      'body.rtggh-career .stopgap{height:6px;}',
      'body.rtggh-career .revealbar{margin-top:8px;padding-top:8px;}',
      'body.rtggh-rankit .lead{padding:8px 12px !important;margin-bottom:8px !important;}',
      'html body.rtggh-rankit .rows{gap:7px;padding:8px 8px 10px;}',
      /* Rows are a fixed height because the drag moves a whole row at a time.
         On a phone that height is one name line and the club line. */
      'html body.rtggh-rankit .rmeta{height:42px;}',
      'html body.rtggh-rankit .rmeta .nm{font-size:19px;-webkit-line-clamp:1;}',
      'html body.rtggh-rankit .rmeta .sub{margin-top:3px;}',
      'body.rtggh-match .lead{padding:8px 12px !important;margin-bottom:8px !important;}',
      'body.rtggh-match .lead .k,body.rtggh-match .lead .explain .lh:empty{display:none !important;}',
      'body.rtggh-match .lead .v{margin-top:0 !important;font-size:13px !important;}',
      'body.rtggh-match .pool-h .t{display:none;}',
      'body.rtggh-match .pool-h{margin-bottom:6px;}',
      'body.rtggh-match .mstatus{padding-top:4px !important;padding-bottom:4px !important;margin-bottom:6px !important;}',
      /* the one-line instruction already asks the question */
      'body.rtggh-career .prompt{display:none;}',
      'body.rtggh-rankit .axis{padding:5px 12px !important;}',
      /* On a phone the order is set by tapping two names (or dragging), which
         is what the line above the board says. The up and down arrows were a
         third way, and a column of them made every row twice as tall. */
      'html body.rtggh-rankit .rrow{grid-template-columns:minmax(0,1fr) auto;padding-top:4px;padding-bottom:4px;}',
      'html body.rtggh-rankit .rrow .ctrl{display:none;}',
      'html body.rtggh-rankit .axis .axmid{display:inline;opacity:.75;}',
      'html body.rtggh-rankit .rord{width:40px;font-size:22px;}',
      /* the scoreboard becomes its line of instruction */
      'body.rtggh .runbar{min-height:0 !important;padding:6px 10px !important;border-left-width:1px !important;box-shadow:none !important;margin-bottom:8px !important;}',
      'body.rtggh .runbar .big,body.rtggh .runbar .best,body.rtggh .runbar .rstat,body.rtggh .runbar .rl .k{display:none !important;}',
      'body.rtggh .runbar .rl{text-align:center;width:100%;}',
      'body.rtggh .runbar .rl .v{font-size:13px !important;line-height:1.35 !important;}',
      'body.rtggh.rtggh-rankit .runbar{display:none !important;}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  // A node moved into the strip leaves a marker behind, so it can go back.
  function move(node, into) {
    if (!node || !node.parentNode) return;
    var mark = document.createComment('rtggh');
    node.parentNode.insertBefore(mark, node);
    moved.push({ node: node, mark: mark });
    into.appendChild(node);
  }
  function restore() {
    for (var i = moved.length - 1; i >= 0; i--) {
      var m = moved[i];
      if (m.mark.parentNode) { m.mark.parentNode.insertBefore(m.node, m.mark); m.mark.parentNode.removeChild(m.mark); }
    }
    moved = [];
  }

  function mirror(statsEl) {
    var defs = STATS[GAME] || [];
    var cells = [];
    defs.forEach(function (d) {
      var src = document.getElementById(d[0]);
      if (!src) return;
      var cell = document.createElement('span');
      cell.className = 'rtggh-stat';
      cell.innerHTML = d[1] + '<b></b>';
      statsEl.appendChild(cell);
      cells.push({ src: src, out: cell.querySelector('b') });
    });
    function sync() { cells.forEach(function (c) { c.out.textContent = (c.src.textContent || '').trim() || '0'; }); }
    sync();
    if (cells.length && window.MutationObserver) {
      obs = new MutationObserver(sync);
      cells.forEach(function (c) { obs.observe(c.src, { childList: true, characterData: true, subtree: true }); });
    }
  }

  function apply() {
    if (on) return;
    var topbar = $('.topbar');
    if (!topbar) return;
    on = true;
    document.body.classList.add('rtggh', 'rtggh-' + GAME);
    strip = document.createElement('div');
    strip.className = 'rtggh-strip';
    strip.innerHTML = '<div class="rtggh-stats"></div><div class="rtggh-right"></div>';
    var statsEl = strip.firstChild, right = strip.lastChild;
    var after = topbar.nextSibling;
    topbar.parentNode.insertBefore(strip, after);
    move($('.chip', topbar), statsEl);
    mirror(statsEl);
    move(document.getElementById('rtbTokens'), right);
    move(document.getElementById('rtbProf'), right);
    if (noticeEl) placeNotice();
  }
  function revert() {
    if (!on) return;
    on = false;
    if (obs) { obs.disconnect(); obs = null; }
    restore();
    if (strip && strip.parentNode) strip.parentNode.removeChild(strip);
    strip = null;
    document.body.classList.remove('rtggh', 'rtggh-' + GAME);
    if (noticeEl) placeNotice();
  }

  // The banner is built by topbanner.js, which runs later in the page. Its
  // pill and account button are only moved once they exist.
  function bannerReady(fn, tries) {
    tries = tries || 0;
    if (document.getElementById('rtbTokens') || tries > 40) return fn();
    setTimeout(function () { bannerReady(fn, tries + 1); }, 50);
  }

  function addLine() {
    var l = LINE[GAME];
    if (!l || document.querySelector('.rtggh-line')) return;
    var at = $(l.before);
    if (!at || !at.parentNode) return;
    var p = document.createElement('p');
    p.className = 'rtggh-line';
    p.textContent = l.text;
    at.parentNode.insertBefore(p, at);
  }

  /* The notice sits directly above the board: under the strip on a phone,
     under the game header everywhere else. */
  function placeNotice() {
    var anchor = strip || $('.topbar');
    if (!anchor || !anchor.parentNode) return;
    anchor.parentNode.insertBefore(noticeEl, anchor.nextSibling);
  }
  function notice(html, opts) {
    css();
    if (!noticeEl) { noticeEl = document.createElement('div'); noticeEl.className = 'rtggh-notice'; noticeEl.setAttribute('role', 'status'); }
    noticeEl.innerHTML = html;
    if (opts && opts.id) noticeEl.id = opts.id;
    placeNotice();
    return noticeEl;
  }
  function clearNotice() { if (noticeEl && noticeEl.parentNode) noticeEl.parentNode.removeChild(noticeEl); noticeEl = null; }

  function boot() {
    css();
    addLine();
    if (!MQ) return;
    bannerReady(function () {
      if (MQ.matches) apply();
      var onChange = function () { if (MQ.matches) apply(); else revert(); };
      if (MQ.addEventListener) MQ.addEventListener('change', onChange); else if (MQ.addListener) MQ.addListener(onChange);
    });
  }

  window.RTGGameHead = { notice: notice, clearNotice: clearNotice, on: function () { return on; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
