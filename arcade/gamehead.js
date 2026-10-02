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
    /* crossword's line is in its own markup now, so it is there at first
       paint. The mechanism stays for a game that needs one later. */
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
      '.rtggh-line{margin:0 0 10px;font-size:16px;font-weight:700;line-height:1.4;color:var(--mut);text-align:center;}',
      '.rtggh-notice{margin:0 0 10px;padding:8px 12px;border-radius:12px;font-size:16px;font-weight:700;line-height:1.4;',
      ' color:var(--ink);background:color-mix(in srgb, var(--gold,#F2B632) 14%, var(--card));',
      ' border:1px solid color-mix(in srgb, var(--gold,#F2B632) 45%, transparent);text-align:center;}',
      '.rtggh-notice a,.rtggh-notice button{font:inherit;font-weight:900;color:var(--goldT,#F2B632);background:none;border:0;padding:0;',
      ' text-decoration:underline;text-underline-offset:3px;cursor:pointer;}',
      /* ---- phone only from here ---- */
      'body.rtggh .rtg-topbanner{display:none !important;}',
      /* arcade.css holds 51px at the top of <body> for the banner until it
         lands. On a phone the banner never shows, so that space goes too, or
         it is held through first paint and then collapses under the reader. */
      'html body.rtggh::before{display:none !important;}',
      /* and the bar is drawn at its final height (the 44px "?" button, which
         howto.js adds a beat later, plus padding) so it does not grow */
      'html body.rtggh .topbar{min-height:54px;box-sizing:border-box;}',
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
      '.rtggh-strip .rtggh-stats{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0;white-space:nowrap;overflow:hidden;',
      /* the clip box reaches past the stats by a few pixels, so the streak
         chip's invisible 44px hit area is not cut off at its own edge */
      ' padding:3px 0 13px 3px;margin:-3px 0 -13px -3px;}',
      /* above the strip is the header, which sits over it, so the streak chip
         reaches down for its 44px the way the account buttons do */
      'html body .rtggh-strip #streakStat::after,html body .rtggh-strip #streakChip::after{inset:-3px -3px -13px -3px;}',
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
      /* Drawn 30px to keep the strip slim, tapped across 44: the hit area
         reaches 7px above and below (the strip's own margin is under it). */
      '.rtggh-strip .rtb-tokens,.rtggh-strip .rtb-prof{position:relative;overflow:visible;}',
      /* reaching down into the strip's margin, because the sticky bar above
         sits over anything that reaches up */
      'html body .rtggh-strip #rtbTokens::after,html body .rtggh-strip #rtbProf::after{content:"";position:absolute;inset:-3px -4px -13px -4px;}',
      /* arcade.css holds 46px for this row while mode.js fills it; filled on
         a phone with the 32px buttons above it is 42, so hold 42. */
      'html body.rtggh .modesw:empty{min-height:42px;}',
      'html body.rtggh .modesw button{position:relative;}',
      'html body.rtggh .modesw button::after{content:"";position:absolute;left:0;right:0;top:-6px;bottom:-6px;}',
      '.rtggh-strip .rtb-prof.out{padding:0 10px;max-width:none;}',
      '.rtggh-strip .rtb-prof:not(.out) .rtb-plab{display:none;}',
      '.rtggh-strip .rtb-prof svg{width:16px;height:16px;flex:0 0 auto;}',
      '.rtggh-strip .rtb-prof .rtb-av{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--coral,#F06A5F),#F0913C);',
      ' color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;}',
      /* ---- each board on one screen at 375x667 ---- */
      'body.rtggh .modesw{margin-bottom:8px !important;}',
      'html body.rtggh .modesw:not(:empty) button{min-height:32px;}',
      'body.rtggh-career .prompt,body.rtggh-almamater .prompt,body.rtggh-oddone .prompt{font-size:16px;margin:0 0 6px;}',
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
      'body.rtggh-match .lead .k{display:none !important;}',
      'body.rtggh-match .lead .v{margin-top:0 !important;font-size:16px !important;}',
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
      'body.rtggh .runbar .rl .v{font-size:16px !important;line-height:1.3 !important;}',
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

  /* The strip is drawn as soon as the top bar is parsed, which is before the
     scoreboard it mirrors exists. So every cell is drawn at once (it holds
     its width) and bound to its source when that has been parsed too. */
  var cells = [];
  function mirror(statsEl) {
    var defs = STATS[GAME] || [];
    cells = [];
    defs.forEach(function (d) {
      var cell = document.createElement('span');
      cell.className = 'rtggh-stat';
      cell.innerHTML = d[1] + '<b>0</b>';
      statsEl.appendChild(cell);
      cells.push({ id: d[0], src: null, out: cell.querySelector('b') });
    });
    bindStats();
  }
  function sync() { cells.forEach(function (c) { if (c.src) c.out.textContent = (c.src.textContent || '').trim() || '0'; }); }
  function bindStats() {
    var fresh = false;
    cells.forEach(function (c) {
      if (c.src) return;
      c.src = document.getElementById(c.id);
      if (!c.src) return;
      fresh = true;
      if (window.MutationObserver) {
        if (!obs) obs = new MutationObserver(sync);
        obs.observe(c.src, { childList: true, characterData: true, subtree: true });
      }
    });
    if (fresh) sync();
    return cells.every(function (c) { return !!c.src; });
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
    attachBanner();
    if (noticeEl) placeNotice();
  }
  // The pill and account button arrive with topbanner.js, sometimes a beat
  // after the strip is drawn. The strip reserves their height, so moving them
  // in later shifts nothing.
  function attachBanner() {
    if (!on || !strip) return;
    var right = strip.lastChild;
    var tk = document.getElementById('rtbTokens'), pf = document.getElementById('rtbProf');
    if (tk && tk.parentNode !== right) move(tk, right);
    if (pf && pf.parentNode !== right) move(pf, right);
  }
  function revert() {
    if (!on) return;
    on = false;
    if (obs) { obs.disconnect(); obs = null; }
    cells = [];
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

  /* THE FREE-PLAY LINE IS DRAWN DURING PARSE. A free account opening a card
     game it has not tried is told, above the board, that its one free play is
     spent on the first move. pregame.js used to add that line after the page
     had painted, which pushed the whole board down 95px. tokens.js loads just
     before this file and is pure localStorage, so the same question can be
     asked here, the moment the top bar has been read, and the line is part of
     the first paint. pregame.js writes the same words into the same element. */
  var TRIAL = 'Your one free play. It\u2019s spent once you start. ' +
    '<button type="button" id="rtgpgCardLine">See the Arcade Card</button>';
  var trialDone = false;
  function earlyTrial(force) {
    var tb = $('.topbar');
    if (!tb || !(force === true || readPast(tb))) return false;
    var T = window.RTGTokens;
    try {
      if (T && T.hasCard && !T.hasCard() && T.canPlay && T.canPlay(GAME) && T.trialOpen && T.trialOpen(GAME))
        notice(TRIAL, { id: 'rtgpgTrial' });
    } catch (e) {}
    return true;
  }

  /* BEFORE FIRST PAINT. This file loads at the end of <body>, so the header
     is already there: the strip is built right away rather than after the
     banner, or the page paints one header and then rearranges into another
     and everything under it jumps. */
  /* This file loads in <head>, and the phone header is built while the page
     is still being parsed: the moment the top bar has been read (its next
     sibling exists), before the browser paints anything. The scoreboard,
     the banner and the crossword's board arrive later in the same parse and
     are picked up as they land. Built after load instead, the page paints
     one header and then rearranges into the other, and the board jumps. */
  var lineDone = false, parseObs = null;
  // The top bar has been read once anything after it has: a sibling, or (on
  // a page where it is the last thing in its wrapper) the wrapper's sibling.
  function readPast(el) {
    for (var n = el; n && n !== document.body; n = n.parentNode) if (n.nextElementSibling) return true;
    return false;
  }
  function step(force) {
    if (!document.body) return;
    var tb = $('.topbar');
    if (MQ && MQ.matches && tb && (force === true || readPast(tb))) apply();
    if (on) { bindStats(); attachBanner(); }
    if (!lineDone) { addLine(); lineDone = !LINE[GAME] || !!document.querySelector('.rtggh-line'); }
    if (!trialDone) trialDone = earlyTrial(force);
  }
  function settle() {
    step(true);
    if (parseObs) { parseObs.disconnect(); parseObs = null; }
    bannerReady(attachBanner);
  }
  function boot() {
    css();
    if (window.MutationObserver && document.readyState === 'loading') {
      parseObs = new MutationObserver(step);
      parseObs.observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', settle);
    } else settle();
    if (!MQ) return;
    var onChange = function () { if (MQ.matches) { apply(); bindStats(); bannerReady(attachBanner); } else revert(); };
    if (MQ.addEventListener) MQ.addEventListener('change', onChange); else if (MQ.addListener) MQ.addListener(onChange);
  }

  window.RTGGameHead = { notice: notice, clearNotice: clearNotice, on: function () { return on; }, TRIAL: TRIAL };
  boot();
})();
