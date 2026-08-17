/* leaderboard.js — the shared arcade leaderboard (window.RTG_LB).
 *
 * Every game used to carry its own renderRealBoard() and its own markup, so
 * the boards drifted apart and none of them answered the question players
 * actually have: where do I stand? This is one component for all ten games.
 *
 * The board is a MODAL, not a rail parked at the bottom of the page. The rail
 * slot becomes a single clear button that carries a live teaser ("You're 9th
 * of 147"), and tapping it opens the full board over the game.
 *
 *   - Today: the top 25. All-time: EVERY player, paged in as you scroll.
 *   - Where YOU stand: rank, field size, percentile, and the gap to the place
 *     above. A top-5 list tells you nothing if you're 23rd.
 *   - Your row pinned to the bottom of the sheet on both tabs, always visible
 *     no matter how far down the list you scroll. Tap it to jump to yourself.
 *   - Honest states: a loading bar over whatever is already drawn, a real
 *     empty state, a signed-out prompt, an offline note - never fake players.
 *
 * Usage from a game page:
 *   RTG_LB.mount({ el: document.querySelector('.lb'), game: 'table',
 *                  date: DATE, kind: 'run', unit: 'in a row' });
 *   RTG_LB.refresh();   // after submitting a result
 *   RTG_LB.open();      // e.g. from a result modal
 *
 * kind: 'run'  - higher run_len wins, shown as "N unit"
 *       'time' - lower seconds wins, shown as m:ss
 *       'pts'  - higher run_len wins, shown as "N pts"
 */
(function () {
  'use strict';
  if (window.RTG_LB) return;

  var LIMIT = 25;                    // today's board depth
  var PAGE = 50;                     // all-time rows fetched per scroll page
  var CFG = null, slot = null, modal = null, sheet = null, bodyEl = null, trigger = null;
  var tab = 'today', busy = false, cache = {}, keepIds = [], openState = false;
  var loadEl = null, pinEl = null, lastHTML = { today: '' };
  // all-time paging state
  var allRows = [], allOffset = 0, allTotal = null, allStats = null,
      allDone = false, allBusy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtTime(s) { s = Math.max(0, Math.round(+s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function fmtN(n) { return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  /* "Top 12%" is a brag; "Top 96%" is an insult wearing a brag's clothes. Only
   * claim a percentile when it's actually the top half — below that the rank
   * and the field size already say everything true. */
  function standing(rank, total) {
    if (rank === 1) return 'Leading';
    var pct = total > 1 ? Math.max(1, Math.round(rank / total * 100)) : 100;
    return pct <= 50 ? 'Top ' + pct + '%' : '';
  }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  /* `game` and `variant` may be given as FUNCTIONS, resolved on every read.
   *
   * The sport editions decide which board they belong to from state that is
   * not always settled when the page mounts — one game briefly queried the
   * all-sports board before its cardholder status resolved, then switched.
   * Resolving lazily removes the whole class of ordering bug: the board asks
   * for the current key at the moment it queries, not once at startup. */
  /* A game key resolver that throws used to be indistinguishable from a quiet
   * day. Common Ground mounted its board with a resolver that referenced a
   * variable trapped inside the game's own IIFE, so every call raised
   * ReferenceError, this catch turned it into null, and the board asked the
   * server for `game=eq.null` and rendered "Nobody has posted today" over a
   * table full of rows. It did that for as long as the shared board existed.
   *
   * Now a resolver that fails is treated as the wiring fault it is: say so in
   * the console and let render() show a broken board rather than an empty one,
   * so the next one of these is a five-minute fix. */
  function gameOf() {
    try {
      var g = typeof CFG.game === 'function' ? CFG.game() : CFG.game;
      if (!g) { warnKey('resolved to ' + (g === '' ? 'an empty string' : String(g))); return null; }
      return g;
    } catch (e) {
      warnKey((e && e.message) || 'threw');
      return null;
    }
  }
  var warned = false;
  function warnKey(why) {
    if (warned) return; warned = true;
    try { console.error('[RTG] leaderboard game key ' + why + '. The board cannot load. Check the mount() call on this page.'); } catch (e) {}
  }
  function variantOf() { try { return typeof CFG.variant === 'function' ? CFG.variant() : CFG.variant; } catch (e) { return null; } }

  /* An empty board has two completely different causes and looks identical
   * either way: nobody has played, or we asked the wrong question. The query is
   * two filters, game and date, and a mismatch in either returns zero rows and
   * the cheerful "be the first" copy.
   *
   * The game key is not a constant. Members play sport editions keyed
   * 'match_nba' and friends, resolved from localStorage at read time, so a
   * cleared key reads the all-sports board while the rows sit under the NBA
   * one. From a phone there is no way to see which was asked for.
   *
   * Add ?lbdebug=1 to the URL and the empty board shows it. Hidden from
   * everyone who has not opted in, on purpose: the answer to an empty board for
   * a normal player is to go and play. */
  function debugOn() {
    try { return /[?&]lbdebug=1/.test(location.search); } catch (e) { return false; }
  }
  function debugLine() {
    if (!debugOn()) return '';
    var esc = function (s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
    return '<div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.14);' +
      'font:700 11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.85">' +
      'game=' + esc(gameOf()) + '<br>date=' + esc(CFG && CFG.date) + '</div>';
  }

  /* One row's headline value, in that game's own language. */
  function valueOf(row) {
    if (!row) return '';
    if (CFG.kind === 'time') return fmtTime(row.base_seconds);
    var n = row.run_len == null ? 0 : row.run_len;
    /* 'tries' games post ATTEMPTS REMAINING, not attempts used, so that the
     * shared score column (most run_len wins, faster breaks the tie) already
     * means "fewest tries wins". The board has to invert it back for display,
     * because nobody thinks in attempts remaining. run_len 0 is a card that
     * never solved. */
    if (CFG.kind === 'tries') {
      var mt = CFG.maxTries || 5;
      if (n <= 0) return 'unsolved';
      var t = Math.max(1, mt + 1 - n);
      return t + (t === 1 ? ' try' : ' tries');
    }
    return n + (CFG.kind === 'pts' ? ' pts' : (CFG.unit ? ' ' + CFG.unit : ''));
  }

  var TROPHY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';

  // ---------------------------------------------------------------- styles
  function styles() {
    if (document.getElementById('rtglb-css')) return;
    var s = document.createElement('style'); s.id = 'rtglb-css';
    s.textContent = [
      '.rtglb-slot{--lba:var(--brand,#FF8A3D);background:none;border:0;box-shadow:none;padding:0;margin:18px 0 14px;}',
      /* the trigger that replaces the old rail */
      '.rtglb-open{--lba:var(--brand,#FF8A3D);width:100%;appearance:none;cursor:pointer;display:flex;align-items:center;gap:11px;',
      '  background:var(--card,#10233A);border:1px solid var(--line2,rgba(255,255,255,.15));border-left:3px solid var(--lba);',
      '  border-radius:13px;padding:13px 15px;font-family:inherit;color:var(--ink,#F4F7FB);text-align:left;',
      '  box-shadow:var(--shadow,0 6px 18px -10px rgba(0,0,0,.55));transition:border-color .14s,transform .08s;}',
      '.rtglb-open:hover{border-color:var(--lba);} .rtglb-open:active{transform:translateY(1px);}',
      '.rtglb-open svg{width:19px;height:19px;color:var(--lba);flex:0 0 auto;}',
      '.rtglb-open .t{flex:1;min-width:0;}',
      '.rtglb-open .t b{display:block;font-family:var(--hero,inherit);font-weight:400;letter-spacing:.03em;text-transform:uppercase;font-size:14px;color:var(--lba);}',
      '.rtglb-open .t span{display:block;font-size:12px;font-weight:700;color:var(--mut,#A9B8CB);margin-top:2px;}',
      '.rtglb-open .chev{font-size:17px;color:var(--mut,#A9B8CB);flex:0 0 auto;}',

      /* modal */
      '.rtglb-scrim{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;',
      '  background:rgba(3,9,18,0);backdrop-filter:blur(0px);transition:background .24s ease,backdrop-filter .24s ease;}',
      '.rtglb-scrim.on{background:rgba(3,9,18,.62);backdrop-filter:blur(4px);}',
      /* an author display: rule beats the UA [hidden] rule, so without this the
         closed modal stays a full-screen layer that swallows every tap. */
      '.rtglb-scrim[hidden]{display:none;}',
      '@media (min-width:560px){.rtglb-scrim{align-items:center;}}',
      '.rtglb-sheet{--lba:var(--brand,#FF8A3D);width:100%;max-width:520px;max-height:88vh;display:flex;flex-direction:column;',
      '  background:var(--card,#10233A);border:1px solid var(--line2,rgba(255,255,255,.15));',
      '  border-radius:20px 20px 0 0;padding:0;box-shadow:0 -18px 50px -20px rgba(0,0,0,.8);',
      '  transform:translateY(26px);opacity:0;transition:transform .26s cubic-bezier(.2,.9,.3,1),opacity .2s ease;}',
      '@media (min-width:560px){.rtglb-sheet{border-radius:20px;transform:translateY(14px) scale(.975);}}',
      '.rtglb-scrim.on .rtglb-sheet{transform:none;opacity:1;}',
      '.rtglb-grab{width:38px;height:4px;border-radius:999px;background:var(--line2,rgba(255,255,255,.15));margin:9px auto 0;flex:0 0 auto;}',
      '@media (min-width:560px){.rtglb-grab{display:none;}}',
      '.rtglb-head{display:flex;align-items:center;gap:10px;padding:14px 16px 12px;flex:0 0 auto;flex-wrap:wrap;}',
      '.rtglb-head h3{font-family:var(--hero,inherit);font-weight:400;letter-spacing:.03em;text-transform:uppercase;',
      '  font-size:16px;color:var(--lba);margin:0;flex:0 0 auto;}',
      /* which version's board this is - the sport editions are separate
         rankings, so an unlabelled "Leaderboard" would be ambiguous */
      '.rtglb-var{font-size:9.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;',
      '  color:var(--lba);border:1px solid var(--lba);border-radius:999px;padding:3px 8px;flex:0 0 auto;}',
      '.rtglb-var[hidden]{display:none;}',
      '.rtglb-x{margin-left:auto;width:32px;height:32px;border-radius:50%;border:1px solid var(--line2,rgba(255,255,255,.15));',
      '  background:var(--card2,#162B44);color:var(--mut,#A9B8CB);cursor:pointer;font-size:14px;line-height:1;flex:0 0 auto;}',
      '.rtglb-tabs{display:inline-flex;background:var(--card2,#162B44);border:1px solid var(--line2,rgba(255,255,255,.15));',
      '  border-radius:999px;padding:2px;gap:2px;width:100%;}',
      '.rtglb-tabs button{flex:1;appearance:none;border:0;background:transparent;cursor:pointer;font-family:inherit;',
      '  font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--mut,#A9B8CB);',
      '  padding:7px 11px;border-radius:999px;min-height:32px;}',
      '.rtglb-tabs button.on{background:var(--lba);color:var(--onAccent,#160B02);}',
      '.rtglb-body{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 16px 18px;flex:1 1 auto;}',
      /* A slim indeterminate bar, so refreshing never blanks the board out from
         under you the way swapping in skeleton rows did. */
      '.rtglb-load{height:3px;background:var(--card3,#1A3350);overflow:hidden;flex:0 0 auto;',
      '  opacity:0;transition:opacity .18s ease;margin:0 16px 10px;border-radius:999px;}',
      '.rtglb-load.on{opacity:1;}',
      '.rtglb-load i{display:block;height:100%;width:38%;border-radius:999px;background:var(--lba);',
      '  animation:rtglbslide 1.05s cubic-bezier(.5,.05,.5,.95) infinite;}',
      '@keyframes rtglbslide{0%{transform:translateX(-110%);}100%{transform:translateX(370%);}}',
      '.rtglb-rows .rtglb-when{font-size:11px;font-weight:700;color:var(--mut,#A9B8CB);flex:0 0 auto;}',

      /* where you stand */
      '.rtglb-you{background:var(--card2,#162B44);border:1px solid var(--line2,rgba(255,255,255,.15));',
      '  border-radius:12px;padding:11px 13px;margin-bottom:11px;}',
      '.rtglb-you .rtglb-top{display:flex;align-items:baseline;gap:9px;}',
      '.rtglb-you .rtglb-rk{font-family:var(--hero,inherit);font-weight:400;font-size:26px;line-height:1;color:var(--lba);font-variant-numeric:tabular-nums;}',
      '.rtglb-you .rtglb-of{font-size:12px;font-weight:700;color:var(--mut,#A9B8CB);}',
      '.rtglb-you .rtglb-pctl{margin-left:auto;font-size:10px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;',
      '  color:var(--lba);border:1px solid var(--lba);border-radius:999px;padding:3px 8px;white-space:nowrap;}',
      '.rtglb-you .rtglb-bar{height:5px;border-radius:999px;background:var(--card3,#1A3350);margin-top:9px;overflow:hidden;}',
      '.rtglb-you .rtglb-bar i{display:block;height:100%;background:var(--lba);width:0;transition:width .5s cubic-bezier(.2,.8,.3,1);}',
      '.rtglb-you .rtglb-gap{font-size:11.5px;font-weight:700;color:var(--mut,#A9B8CB);margin-top:8px;}',
      '.rtglb-you .rtglb-gap b{color:var(--ink,#F4F7FB);}',

      /* rows */
      '.rtglb-rows{list-style:none;margin:0;padding:0;}',
      '.rtglb-rows li{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13px;',
      '  border-top:1px solid var(--line,rgba(255,255,255,.08));color:var(--ink,#F4F7FB);}',
      '.rtglb-rows li:first-child{border-top:0;}',
      '.rtglb-rows .rtglb-rk{flex:0 0 24px;font-family:var(--hero,inherit);font-weight:400;color:var(--mut,#A9B8CB);',
      '  font-variant-numeric:tabular-nums;text-align:center;}',
      '.rtglb-rows .rtglb-who{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}',
      '.rtglb-rows .rtglb-val{font-variant-numeric:tabular-nums;color:var(--lba);font-weight:800;flex:0 0 auto;}',
      '.rtglb-rows li.rtglb-me{color:var(--lba);}',
      '.rtglb-rows li.rtglb-me .rtglb-who{font-weight:900;}',
      '.rtglb-rows li.rtglb-me .rtglb-rk{color:var(--lba);}',
      '.rtglb-rows .rtglb-medal{font-size:15px;line-height:1;}',
      '.rtglb-rows li.rtglb-split{border-top:1px dashed var(--line2,rgba(255,255,255,.15));color:var(--dim,#7C8DA3);',
      '  justify-content:center;font-size:11px;letter-spacing:.3em;padding:5px 0;}',
      '.rtglb-rows .rtglb-fl{font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--greenT,#48D17A);}',
      '.rtglb-rows li.rtglb-flash{animation:rtglbflash 1.1s ease-out 1;}',
      '@keyframes rtglbflash{0%,45%{background:var(--card3,#1A3350);}100%{background:transparent;}}',

      /* your row, pinned to the bottom of the sheet on both tabs */
      '.rtglb-pin{flex:0 0 auto;border-top:1px solid var(--line2,rgba(255,255,255,.15));',
      '  background:var(--card2,#162B44);padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));',
      '  border-radius:0 0 20px 20px;}',
      '@media (max-width:559px){.rtglb-pin{border-radius:0;}}',
      '.rtglb-pin[hidden]{display:none;}',
      '.rtglb-pinrow{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;padding:0;',
      '  font-family:inherit;color:var(--ink,#F4F7FB);text-align:left;}',
      'button.rtglb-pinrow{cursor:pointer;}',
      '.rtglb-pin .rtglb-rk{flex:0 0 auto;min-width:38px;font-family:var(--hero,inherit);font-weight:400;font-size:19px;',
      '  line-height:1;color:var(--lba);font-variant-numeric:tabular-nums;}',
      '.rtglb-pin .rtglb-who{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      '  font-size:13px;font-weight:900;}',
      '.rtglb-pin .rtglb-val{flex:0 0 auto;font-size:13px;font-weight:800;color:var(--lba);font-variant-numeric:tabular-nums;}',
      '.rtglb-pin .rtglb-sub{font-size:11px;font-weight:700;color:var(--mut,#A9B8CB);margin-top:3px;padding-left:48px;}',
      '.rtglb-pin .rtglb-pinmsg{font-size:12px;font-weight:700;color:var(--mut,#A9B8CB);line-height:1.45;}',
      '.rtglb-pin .rtglb-cta{margin-top:0;}',

      /* paging line under the all-time list */
      '.rtglb-more{font-size:11px;font-weight:700;color:var(--dim,#7C8DA3);text-align:center;padding:12px 0 2px;',
      '  letter-spacing:.04em;}',
      '.rtglb-more button{appearance:none;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:900;',
      '  letter-spacing:.06em;text-transform:uppercase;color:var(--lba);background:none;',
      '  border:1px solid var(--line2,rgba(255,255,255,.15));border-radius:999px;padding:8px 16px;}',

      /* states */
      '.rtglb-sk{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line,rgba(255,255,255,.08));}',
      '.rtglb-sk:first-child{border-top:0;}',
      '.rtglb-sk i{display:block;height:10px;border-radius:999px;background:var(--card3,#1A3350);animation:rtglbsk 1.2s ease-in-out infinite;}',
      '.rtglb-sk i.a{width:22px;} .rtglb-sk i.b{flex:1;} .rtglb-sk i.c{width:54px;}',
      '@keyframes rtglbsk{0%,100%{opacity:.45;}50%{opacity:.9;}}',
      '.rtglb-msg{font-size:12.5px;color:var(--mut,#A9B8CB);line-height:1.5;padding:10px 0 2px;}',
      '.rtglb-msg b{color:var(--ink,#F4F7FB);}',
      '.rtglb-foot{font-size:11px;color:var(--mut,#A9B8CB);margin-top:11px;line-height:1.5;}',
      '.rtglb-cta{appearance:none;cursor:pointer;margin-top:11px;width:100%;background:var(--lba);color:var(--onAccent,#160B02);border:0;',
      '  border-radius:10px;padding:11px;font-family:inherit;font-weight:900;font-size:12.5px;}',
      '@media (prefers-reduced-motion: reduce){.rtglb-sk i,.rtglb-load i{animation:none;}.rtglb-you .rtglb-bar i{transition:none;}',
      '  .rtglb-scrim,.rtglb-sheet{transition:none;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ------------------------------------------------------------- modal
  function buildModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'rtglb-scrim'; modal.hidden = true;
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Leaderboard');
    sheet = document.createElement('div'); sheet.className = 'rtglb-sheet';
    sheet.innerHTML = '<div class="rtglb-grab"></div>' +
      '<div class="rtglb-head"><h3>Leaderboard</h3><span class="rtglb-var" hidden></span>' +
      '<button class="rtglb-x" type="button" aria-label="Close">✕</button>' +
      '<div class="rtglb-tabs"><button type="button" data-tab="today">Today</button>' +
      '<button type="button" data-tab="all">All-time</button></div></div>' +
      '<div class="rtglb-load"><i></i></div><div class="rtglb-body"></div>' +
      '<div class="rtglb-pin" hidden></div>';
    modal.appendChild(sheet);
    document.body.appendChild(modal);
    bodyEl = sheet.querySelector('.rtglb-body');
    loadEl = sheet.querySelector('.rtglb-load');
    pinEl = sheet.querySelector('.rtglb-pin');

    // All-time is the whole field, not a top-N. Pull the next page in as the
    // list runs out under the thumb.
    bodyEl.addEventListener('scroll', function () {
      if (tab !== 'all' || allDone || allBusy || !allRows.length) return;
      if (bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight < 240) loadAllPage();
    });

    sheet.querySelector('.rtglb-x').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    [].forEach.call(sheet.querySelectorAll('.rtglb-tabs button'), function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-tab'); if (t === tab) return;
        tab = t; syncTabs();
        try { bodyEl.scrollTop = 0; } catch (e) {}
        render();
      });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openState) close(); });
    syncTabs(); syncVariant();
  }
  function syncVariant() {
    if (!sheet) return;
    var el = sheet.querySelector('.rtglb-var');
    if (!el) return;
    var v = CFG && variantOf();
    if (v) { el.textContent = v; el.hidden = false; } else { el.hidden = true; }
  }
  function syncTabs() {
    if (!sheet) return;
    [].forEach.call(sheet.querySelectorAll('.rtglb-tabs button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === tab);
    });
  }
  function open() {
    buildModal(); styles();
    if (openState) return;
    openState = true;
    modal.hidden = false;
    try { document.body.style.overflow = 'hidden'; } catch (e) {}
    // let the browser paint the hidden state once so the transition actually runs
    requestAnimationFrame(function () { requestAnimationFrame(function () { modal.classList.add('on'); }); });
    render();
    try { sheet.querySelector('.rtglb-x').focus({ preventScroll: true }); } catch (e) {}
  }
  function close() {
    if (!openState || !modal) return;
    openState = false;
    modal.classList.remove('on');
    try { document.body.style.overflow = ''; } catch (e) {}
    var ms = reduced() ? 0 : 240;
    setTimeout(function () { if (!openState) modal.hidden = true; }, ms);
  }

  // ------------------------------------------------------------- trigger
  /* Games still write their own stats into the rail's old ids (#yourBest,
   * #lbSample, ...) and most do it unguarded, so those ids stay alive as
   * hidden stubs inside the slot. No game file has to change. */
  function buildTrigger() {
    keepIds = [];
    [].forEach.call(slot.querySelectorAll('[id]'), function (el) { keepIds.push(el.id); });
    slot.className = (slot.className + ' rtglb-slot').trim();
    slot.innerHTML = '';
    trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'rtglb-open';
    trigger.innerHTML = TROPHY + '<span class="t"><b>Leaderboard</b><span id="rtglbTease">See where you rank today</span></span><span class="chev">›</span>';
    trigger.addEventListener('click', open);
    slot.appendChild(trigger);
    for (var i = 0; i < keepIds.length; i++) {
      var st = document.createElement('span'); st.id = keepIds[i]; st.style.display = 'none';
      slot.appendChild(st);
    }
  }
  function tease(txt) { var t = document.getElementById('rtglbTease'); if (t && txt) t.textContent = txt; }

  // -------------------------------------------------------------- render
  function busyBar(on) { if (loadEl) loadEl.classList.toggle('on', !!on); }
  function paint(html) {
    if (!bodyEl) return;
    bodyEl.innerHTML = html;
    var cta = bodyEl.querySelector('.rtglb-cta');
    if (cta) cta.addEventListener('click', function () { try { if (window.RTGAuthUI) RTGAuthUI.open('signin'); } catch (e) {} });
  }

  function fmtDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); if (!m) return '';
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(+m[2]) - 1] + ' ' + (+m[3]);
  }
  /* Just the <li>s, so a new all-time page can be appended to the list that's
   * already on screen instead of re-rendering (and re-scrolling) the lot.
   * startRank is the 1-based rank of rows[0]. */
  function rowsLI(rows, myName, startRank) {
    var MED = ['🥇', '🥈', '🥉'];
    var base = startRank || 1, h = '';
    rows.forEach(function (r, i) {
      var rank = base + i;
      var mine = myName && r.display_name && r.display_name.toLowerCase() === myName.toLowerCase();
      h += '<li class="' + (mine ? 'rtglb-me' : '') + '" data-rank="' + rank + '">' +
        '<span class="rtglb-rk">' + (rank <= 3 ? '<span class="rtglb-medal">' + MED[rank - 1] + '</span>' : rank) + '</span>' +
        '<span class="rtglb-who">' + esc(r.display_name || 'Player') + (mine ? ' (you)' : '') + '</span>' +
        (tab === 'all' && r.played_on ? '<span class="rtglb-when">' + esc(fmtDate(r.played_on)) + '</span>' : '') +
        '<span class="rtglb-val">' + esc(valueOf(r)) + '</span></li>';
    });
    return h;
  }
  function rowsHTML(rows, myName) { return '<ol class="rtglb-rows">' + rowsLI(rows, myName, 1) + '</ol>'; }

  // ------------------------------------------------------- your pinned row
  /* The one thing a player always wants on screen. It lives outside the
   * scroller, so it survives a thousand rows of all-time. */
  function renderPin(rank, total, row, st) {
    if (!pinEl) return;
    var canJump = false, h;
    if (!st || !st.signedIn) {
      h = '<button class="rtglb-cta" type="button">Sign in to see where you rank</button>';
    } else if (!row || !rank) {
      h = '<div class="rtglb-pinmsg">' + (tab === 'all'
        ? 'No all-time result yet. Finish a puzzle to claim a spot.'
        : 'You haven’t posted today. Finish the puzzle to take a spot.') + '</div>';
    } else {
      // Only offer the jump when the row is actually loaded — a button that
      // silently does nothing is worse than no button.
      canJump = !!(bodyEl && bodyEl.querySelector('.rtglb-rows li[data-rank="' + rank + '"]'));
      var bits = ['of ' + fmtN(total || rank)];
      var lead = standing(rank, total || rank); if (lead) bits.push(lead);
      if (tab === 'all' && row.played_on) bits.push(esc(fmtDate(row.played_on)));
      if (canJump) bits.push('tap to find yourself');
      h = '<' + (canJump ? 'button class="rtglb-pinrow" type="button"' : 'div class="rtglb-pinrow"') + '>' +
        '<span class="rtglb-rk">' + ord(rank) + '</span>' +
        '<span class="rtglb-who">You' + (row.display_name ? ' · ' + esc(row.display_name) : '') + '</span>' +
        '<span class="rtglb-val">' + esc(valueOf(row)) + '</span>' +
        '</' + (canJump ? 'button' : 'div') + '>' +
        '<div class="rtglb-sub">' + bits.join(' · ') + '</div>';
    }
    pinEl.innerHTML = h;
    pinEl.hidden = false;
    var cta = pinEl.querySelector('.rtglb-cta');
    if (cta) cta.addEventListener('click', function () { try { if (window.RTGAuthUI) RTGAuthUI.open('signin'); } catch (e) {} });
    var jump = canJump && pinEl.querySelector('button.rtglb-pinrow');
    if (jump) jump.addEventListener('click', function () { jumpToMe(rank); });
  }
  function jumpToMe(rank) {
    if (!bodyEl) return;
    var li = bodyEl.querySelector('.rtglb-rows li[data-rank="' + rank + '"]');
    if (!li) return;
    bodyEl.scrollTop = li.offsetTop - Math.round(bodyEl.clientHeight / 2) + li.offsetHeight;
    li.classList.remove('rtglb-flash');
    void li.offsetWidth;                       // restart the animation
    li.classList.add('rtglb-flash');
  }

  function youHTML(rank, total, mine, rows) {
    if (!mine || !rank) return '';
    var lead = rank === 1 ? 'Leading today' : standing(rank, total);
    var fill = total > 1 ? Math.max(4, Math.round((1 - (rank - 1) / total) * 100)) : 100;
    var gap = '';
    // Only when the player above is actually on screen — measuring against the
    // last visible row would quote a gap to the wrong person entirely.
    var above = (rank > 1 && rank <= rows.length) ? rows[rank - 2] : null;
    if (above) {
      if (CFG.kind === 'time') {
        var d = Math.max(0, Math.round((mine.base_seconds || 0) - (above.base_seconds || 0)));
        if (d > 0) gap = '<b>' + d + 's</b> faster takes ' + ord(rank - 1);
      } else if (CFG.kind === 'tries') {
        var dt = Math.max(0, (above.run_len || 0) - (mine.run_len || 0));
        if (dt > 0) gap = '<b>' + dt + '</b> fewer ' + (dt === 1 ? 'try' : 'tries') + ' takes ' + ord(rank - 1);
      } else {
        var dd = Math.max(0, (above.run_len || 0) - (mine.run_len || 0));
        var unit = CFG.kind === 'pts' ? (dd === 1 ? 'pt' : 'pts') : (CFG.unit || 'more');
        if (dd > 0) gap = '<b>+' + dd + '</b> ' + unit + ' takes ' + ord(rank - 1);
      }
    }
    tease(ord(rank) + ' of ' + fmtN(total) + ' today' + (lead ? ' · ' + lead : ''));
    return '<div class="rtglb-you">' +
      '<div class="rtglb-top"><span class="rtglb-rk">' + ord(rank) + '</span>' +
      '<span class="rtglb-of">of ' + fmtN(total) + ' today</span>' +
      (lead ? '<span class="rtglb-pctl">' + lead + '</span>' : '') + '</div>' +
      '<div class="rtglb-bar"><i style="width:' + fill + '%"></i></div>' +
      (gap ? '<div class="rtglb-gap">' + gap + '</div>' : '') +
      '</div>';
  }

  function footNote(total) {
    var what = CFG.kind === 'time' ? 'Fastest clean solve wins' :
      (CFG.kind === 'pts' ? 'Most points wins, ties broken by time' :
      (CFG.kind === 'tries' ? 'Fewest tries wins, ties broken by time' :
       'Longest run wins, ties broken by time'));
    return what + (total ? ' · <b>' + total + '</b> played today' : '') + '. Resets at midnight.';
  }

  function render() {
    if (!CFG || !bodyEl) return;
    styles(); syncVariant();
    var B = window.RTG_BOARD;
    if (!B || !B.leaderboard) { paint('<div class="rtglb-msg">Leaderboard unavailable.</div>'); return; }
    // Show what we already have and refresh underneath the bar; only a first,
    // contentless load starts empty.
    if (!gameOf()) {
      paint('<div class="rtglb-msg">This board is misconfigured and can’t load. Your results are safe.' +
            debugLine() + '</div>');
      if (pinEl) pinEl.hidden = true;
      return;
    }
    if (tab === 'all') { renderAll(); return; }
    paint(lastHTML.today || '');
    busyBar(true);

    busy = true;
    var st = (B.state && B.state()) || {};
    Promise.all([
      B.leaderboard(gameOf(), CFG.date, LIMIT),
      B.playerCount ? B.playerCount(gameOf(), CFG.date) : Promise.resolve(null),
      (B.myRun && st.signedIn) ? B.myRun(gameOf(), CFG.date) : Promise.resolve(null)
    ]).then(function (res) {
      busy = false; busyBar(false);
      var rows = res[0], total = res[1], mine = res[2];
      cache.mine = mine;
      if (rows === null) {
        paint('<div class="rtglb-msg">Board unavailable offline. Your result is saved and will post when you reconnect.</div>');
        if (pinEl) pinEl.hidden = true;
        return;
      }
      if (!rows.length) {
        paint('<div class="rtglb-msg"><b>Nobody has posted today.</b> Finish the puzzle and you’ll be first on the board.' +
              debugLine() + '</div>');
        renderPin(null, 0, null, st);
        tease('Be the first on today’s board');
        return;
      }
      if (total) tease(total + ' played today · tap to see the board');
      var myName = st.name || null;
      var done = function (myRank) {
        var html = youHTML(myRank, total || rows.length, mine, rows) +
          rowsHTML(rows, myName) +
          '<div class="rtglb-foot">' + footNote(total) + '</div>';
        lastHTML.today = html; paint(html); busyBar(false);
        renderPin(myRank, total || rows.length, mine, st);
      };
      if (mine && B.rank) B.rank(gameOf(), CFG.date, mine.score).then(done);
      else done(null);
    }).catch(function () {
      busy = false; busyBar(false);
      if (!lastHTML.today) paint('<div class="rtglb-msg">Couldn’t load the board. It’ll retry shortly.</div>');
    });
  }

  // ------------------------------------------------------------- all-time
  /* The full field, not a top-N. First entry paints page one plus the stats
   * row; scrolling appends pages until the server runs out. */
  function resetAll() { allRows = []; allOffset = 0; allTotal = null; allStats = null; allDone = false; }

  function allFootHTML() {
    var shown = allRows.length;
    var line = allDone
      ? (allTotal ? fmtN(allTotal) + ' player' + (allTotal === 1 ? '' : 's') + ', every one of them'
                  : 'That’s everyone')
      : 'Showing ' + fmtN(shown) + (allTotal ? ' of ' + fmtN(allTotal) : '') + ' · scroll for more';
    return '<div class="rtglb-more" id="rtglbMore">' + line +
      (allDone ? '' : '<div style="margin-top:8px"><button type="button">Load more</button></div>') + '</div>' +
      '<div class="rtglb-foot">Every player’s single best result, all time.</div>';
  }
  function syncAllFoot() {
    var el = bodyEl && bodyEl.querySelector('#rtglbMore');
    if (!el) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = allFootHTML();
    var fresh = wrap.querySelector('#rtglbMore');
    el.innerHTML = fresh.innerHTML;
    var b = el.querySelector('button');
    if (b) b.addEventListener('click', loadAllPage);
  }

  function renderAll() {
    var B = window.RTG_BOARD;
    if (!B || !B.allTimePage) { busyBar(false); paint('<div class="rtglb-msg">All-time board unavailable.</div>'); return; }
    // Already loaded this session: repaint what we have, don't refetch pages.
    if (allRows.length) {
      var st = (B.state && B.state()) || {};
      paint(rowsHTML(allRows, st.name || null) + allFootHTML());
      var b = bodyEl.querySelector('#rtglbMore button');
      if (b) b.addEventListener('click', loadAllPage);
      renderPin(allStats && allStats.my_rank, allTotal, allStats && allStats.score != null ? allStats : null, st);
      return;
    }
    busyBar(true);
    loadAllPage();
  }

  function loadAllPage() {
    var B = window.RTG_BOARD;
    if (allBusy || allDone || !B || !B.allTimePage) return;
    allBusy = true; busyBar(true);
    var first = allOffset === 0;
    Promise.all([
      B.allTimePage(gameOf(), PAGE, allOffset),
      (first && B.allTimeStats) ? B.allTimeStats(gameOf()) : Promise.resolve(null)
    ]).then(function (res) {
      allBusy = false; busyBar(false);
      var page = res[0], stats = res[1];
      var st = (B.state && B.state()) || {};
      if (stats) { allStats = stats; allTotal = stats.total == null ? null : (stats.total | 0); }
      if (!page) {
        if (first) paint('<div class="rtglb-msg">All-time board unavailable offline.</div>');
        else syncAllFoot();
        return;
      }
      // Advance by what the SERVER sent, not by what survived scrub(), or every
      // later page would skip a real player for each hidden one.
      allOffset += page.raw;
      if (page.raw < PAGE) allDone = true;
      var startRank = allRows.length + 1;
      allRows = allRows.concat(page.rows);
      if (first) {
        if (!allRows.length) {
          paint('<div class="rtglb-msg">No all-time results yet. Be the first name on this board.</div>');
          renderPin(null, 0, null, st);
          return;
        }
        paint(rowsHTML(allRows, st.name || null) + allFootHTML());
        var b = bodyEl.querySelector('#rtglbMore button');
        if (b) b.addEventListener('click', loadAllPage);
      } else {
        var ol = bodyEl.querySelector('.rtglb-rows');
        if (ol && page.rows.length) ol.insertAdjacentHTML('beforeend', rowsLI(page.rows, st.name || null, startRank));
        syncAllFoot();
      }
      renderPin(allStats && allStats.my_rank, allTotal, (allStats && allStats.score != null) ? allStats : null, st);
    }).catch(function () {
      allBusy = false; busyBar(false);
      if (!allRows.length) paint('<div class="rtglb-msg">Couldn’t load the all-time board.</div>');
      else syncAllFoot();
    });
  }

  // ---------------------------------------------------------------- api
  window.RTG_LB = {
    mount: function (cfg) {
      CFG = cfg || {};
      slot = CFG.el || document.querySelector('.lb') || document.querySelector('.mlb');
      if (!slot) return;
      styles(); buildTrigger(); buildModal();
      // warm the teaser without opening anything
      render();
      // The hub's "Leaderboard" button deep-links to /arcade/<game>/#lb. That
      // used to anchor-scroll to the rail; now that the board is a modal the
      // hash has to open it, or the tap just dumps you on the game.
      try {
        if (/^#lb\b/i.test(location.hash || '')) {
          setTimeout(open, 60);
          if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
        }
      } catch (e) {}
      try {
        // Signing in changes who "you" are on every board, so the cached
        // all-time pages (fetched anonymously, with no rank of your own) have
        // to go back to the server.
        if (window.RTG_BOARD && RTG_BOARD.onChange) RTG_BOARD.onChange(function () { resetAll(); if (!busy) render(); });
      } catch (e) {}
    },
    open: open, close: close,
    refresh: function () { cache = {}; resetAll(); render(); },
    setDate: function (d) { if (CFG) { CFG.date = d; cache = {}; resetAll(); render(); } },
    /* Repoint the board at another game key without remounting.
     *
     * The sport editions switch in place — no reload — so the board has to
     * follow, or you sit on the NBA version looking at the all-sports ranking.
     * `variant` is the human label ("NBA"); it shows in the sheet header so it
     * is never ambiguous which board you are reading. */
    setGame: function (g, variant) {
      if (!CFG || !g) return;
      // No "already there" shortcut: `game` is usually a resolver that ALREADY
      // reflects the new mode by the time this is called, so comparing keys
      // would skip the update every time and leave the badge stale.
      CFG.game = g; CFG.variant = variant || null;
      cache = {}; resetAll(); lastHTML.today = '';
      syncVariant();
      render();
    }
  };
})();
