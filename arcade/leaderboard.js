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
 *   - Today / All-time tabs, 25 deep on each, scrolled inside the sheet.
 *   - Where YOU stand: rank, field size, percentile, and the gap to the place
 *     above. A top-5 list tells you nothing if you're 23rd.
 *   - Your row pinned in when you finish outside the visible top.
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

  var LIMIT = 25;                    // rows fetched for both tabs
  var CFG = null, slot = null, modal = null, sheet = null, bodyEl = null, trigger = null;
  var tab = 'today', busy = false, cache = {}, keepIds = [], openState = false;
  var loadEl = null, lastHTML = { today: '', all: '' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtTime(s) { s = Math.max(0, Math.round(+s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  /* One row's headline value, in that game's own language. */
  function valueOf(row) {
    if (!row) return '';
    if (CFG.kind === 'time') return fmtTime(row.base_seconds);
    var n = row.run_len == null ? 0 : row.run_len;
    return n + (CFG.kind === 'pts' ? ' pts' : (CFG.unit ? ' ' + CFG.unit : ''));
  }

  var TROPHY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';

  // ---------------------------------------------------------------- styles
  function styles() {
    if (document.getElementById('rtglb-css')) return;
    var s = document.createElement('style'); s.id = 'rtglb-css';
    s.textContent = [
      '.rtglb-slot{--lba:var(--accent,var(--coralT,#F06A5F));background:none;border:0;box-shadow:none;padding:0;margin:18px 0 14px;}',
      /* the trigger that replaces the old rail */
      '.rtglb-open{--lba:var(--accent,var(--coralT,#F06A5F));width:100%;appearance:none;cursor:pointer;display:flex;align-items:center;gap:11px;',
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
      '.rtglb-sheet{--lba:var(--accent,var(--coralT,#F06A5F));width:100%;max-width:520px;max-height:88vh;display:flex;flex-direction:column;',
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
      '.rtglb-x{margin-left:auto;width:32px;height:32px;border-radius:50%;border:1px solid var(--line2,rgba(255,255,255,.15));',
      '  background:var(--card2,#162B44);color:var(--mut,#A9B8CB);cursor:pointer;font-size:14px;line-height:1;flex:0 0 auto;}',
      '.rtglb-tabs{display:inline-flex;background:var(--card2,#162B44);border:1px solid var(--line2,rgba(255,255,255,.15));',
      '  border-radius:999px;padding:2px;gap:2px;width:100%;}',
      '.rtglb-tabs button{flex:1;appearance:none;border:0;background:transparent;cursor:pointer;font-family:inherit;',
      '  font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--mut,#A9B8CB);',
      '  padding:7px 11px;border-radius:999px;min-height:32px;}',
      '.rtglb-tabs button.on{background:var(--lba);color:#0A1728;}',
      ':root[data-theme="light"] .rtglb-tabs button.on{color:#fff;}',
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

      /* states */
      '.rtglb-sk{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line,rgba(255,255,255,.08));}',
      '.rtglb-sk:first-child{border-top:0;}',
      '.rtglb-sk i{display:block;height:10px;border-radius:999px;background:var(--card3,#1A3350);animation:rtglbsk 1.2s ease-in-out infinite;}',
      '.rtglb-sk i.a{width:22px;} .rtglb-sk i.b{flex:1;} .rtglb-sk i.c{width:54px;}',
      '@keyframes rtglbsk{0%,100%{opacity:.45;}50%{opacity:.9;}}',
      '.rtglb-msg{font-size:12.5px;color:var(--mut,#A9B8CB);line-height:1.5;padding:10px 0 2px;}',
      '.rtglb-msg b{color:var(--ink,#F4F7FB);}',
      '.rtglb-foot{font-size:11px;color:var(--mut,#A9B8CB);margin-top:11px;line-height:1.5;}',
      '.rtglb-cta{appearance:none;cursor:pointer;margin-top:11px;width:100%;background:var(--lba);color:#0A1728;border:0;',
      '  border-radius:10px;padding:11px;font-family:inherit;font-weight:900;font-size:12.5px;}',
      ':root[data-theme="light"] .rtglb-cta{color:#fff;}',
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
      '<div class="rtglb-head"><h3>Leaderboard</h3><button class="rtglb-x" type="button" aria-label="Close">✕</button>' +
      '<div class="rtglb-tabs"><button type="button" data-tab="today">Today</button>' +
      '<button type="button" data-tab="all">All-time</button></div></div>' +
      '<div class="rtglb-load"><i></i></div><div class="rtglb-body"></div>';
    modal.appendChild(sheet);
    document.body.appendChild(modal);
    bodyEl = sheet.querySelector('.rtglb-body');
    loadEl = sheet.querySelector('.rtglb-load');

    sheet.querySelector('.rtglb-x').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    [].forEach.call(sheet.querySelectorAll('.rtglb-tabs button'), function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-tab'); if (t === tab) return;
        tab = t; syncTabs(); render();
      });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openState) close(); });
    syncTabs();
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
  function rowsHTML(rows, myName, myRank) {
    var MED = ['🥇', '🥈', '🥉'];
    var h = '', shown = {}, meShown = false;
    rows.forEach(function (r, i) {
      var mine = myName && r.display_name && r.display_name.toLowerCase() === myName.toLowerCase();
      if (mine) meShown = true;
      shown[i + 1] = 1;
      h += '<li class="' + (mine ? 'rtglb-me' : '') + '">' +
        '<span class="rtglb-rk">' + (i < 3 ? '<span class="rtglb-medal">' + MED[i] + '</span>' : (i + 1)) + '</span>' +
        '<span class="rtglb-who">' + esc(r.display_name || 'Player') + (mine ? ' (you)' : '') + '</span>' +
        (tab === 'all' && r.played_on ? '<span class="rtglb-when">' + esc(fmtDate(r.played_on)) + '</span>' : '') +
        '<span class="rtglb-val">' + esc(valueOf(r)) + '</span></li>';
    });
    if (myRank && !shown[myRank] && !meShown && cache.mine) {
      h += '<li class="rtglb-split">· · ·</li>' +
        '<li class="rtglb-me"><span class="rtglb-rk">' + myRank + '</span>' +
        '<span class="rtglb-who">' + esc(myName || 'You') + ' (you)</span>' +
        '<span class="rtglb-val">' + esc(valueOf(cache.mine)) + '</span></li>';
    }
    return '<ol class="rtglb-rows">' + h + '</ol>';
  }

  function youHTML(rank, total, mine, rows) {
    if (!mine || !rank) return '';
    var pct = total > 1 ? Math.max(1, Math.round(rank / total * 100)) : 100;
    var lead = rank === 1 ? 'Leading today' : 'Top ' + pct + '%';
    var fill = total > 1 ? Math.max(4, Math.round((1 - (rank - 1) / total) * 100)) : 100;
    var gap = '';
    // Only when the player above is actually on screen — measuring against the
    // last visible row would quote a gap to the wrong person entirely.
    var above = (rank > 1 && rank <= rows.length) ? rows[rank - 2] : null;
    if (above) {
      if (CFG.kind === 'time') {
        var d = Math.max(0, Math.round((mine.base_seconds || 0) - (above.base_seconds || 0)));
        if (d > 0) gap = '<b>' + d + 's</b> faster takes ' + ord(rank - 1);
      } else {
        var dd = Math.max(0, (above.run_len || 0) - (mine.run_len || 0));
        var unit = CFG.kind === 'pts' ? (dd === 1 ? 'pt' : 'pts') : (CFG.unit || 'more');
        if (dd > 0) gap = '<b>+' + dd + '</b> ' + unit + ' takes ' + ord(rank - 1);
      }
    }
    tease(ord(rank) + ' of ' + total + ' today · ' + lead);
    return '<div class="rtglb-you">' +
      '<div class="rtglb-top"><span class="rtglb-rk">' + ord(rank) + '</span>' +
      '<span class="rtglb-of">of ' + total + ' today</span>' +
      '<span class="rtglb-pctl">' + lead + '</span></div>' +
      '<div class="rtglb-bar"><i style="width:' + fill + '%"></i></div>' +
      (gap ? '<div class="rtglb-gap">' + gap + '</div>' : '') +
      '</div>';
  }

  function footNote(total) {
    var what = CFG.kind === 'time' ? 'Fastest clean solve wins' :
      (CFG.kind === 'pts' ? 'Most points wins, ties broken by time' : 'Longest run wins, ties broken by time');
    return what + (total ? ' · <b>' + total + '</b> played today' : '') + '. Resets at midnight.';
  }

  function render() {
    if (!CFG || !bodyEl) return;
    styles();
    var B = window.RTG_BOARD;
    if (!B || !B.leaderboard) { paint('<div class="rtglb-msg">Leaderboard unavailable.</div>'); return; }
    // Show what we already have and refresh underneath the bar; only a first,
    // contentless load starts empty.
    paint(lastHTML[tab] || '');
    busyBar(true);
    if (tab === 'all') { renderAll(); return; }

    busy = true;
    var st = (B.state && B.state()) || {};
    Promise.all([
      B.leaderboard(CFG.game, CFG.date, LIMIT),
      B.playerCount ? B.playerCount(CFG.game, CFG.date) : Promise.resolve(null),
      (B.myRun && st.signedIn) ? B.myRun(CFG.game, CFG.date) : Promise.resolve(null)
    ]).then(function (res) {
      busy = false; busyBar(false);
      var rows = res[0], total = res[1], mine = res[2];
      cache.mine = mine;
      if (rows === null) { paint('<div class="rtglb-msg">Board unavailable offline. Your result is saved and will post when you reconnect.</div>'); return; }
      if (!rows.length) {
        paint('<div class="rtglb-msg"><b>Nobody has posted today.</b> Finish the puzzle and you’ll be first on the board.</div>' +
          (st.signedIn ? '' : '<button class="rtglb-cta" type="button">Sign in to compete</button>'));
        tease('Be the first on today’s board');
        return;
      }
      if (total) tease(total + ' played today · tap to see the board');
      var myName = st.name || null;
      var done = function (myRank) {
        var html = youHTML(myRank, total || rows.length, mine, rows) +
          rowsHTML(rows, myName, myRank) +
          '<div class="rtglb-foot">' + footNote(total) + '</div>' +
          (st.signedIn ? '' : '<button class="rtglb-cta" type="button">Sign in to join the board</button>');
        lastHTML.today = html; paint(html); busyBar(false);
      };
      if (mine && B.rank) B.rank(CFG.game, CFG.date, mine.score).then(done);
      else done(null);
    }).catch(function () {
      busy = false; busyBar(false);
      if (!lastHTML.today) paint('<div class="rtglb-msg">Couldn’t load the board. It’ll retry shortly.</div>');
    });
  }

  function renderAll() {
    var B = window.RTG_BOARD;
    if (!B.allTimeBoard) { busyBar(false); paint('<div class="rtglb-msg">All-time board unavailable.</div>'); return; }
    Promise.resolve(B.allTimeBoard(CFG.game, LIMIT)).then(function (rows) {
      busyBar(false);
      if (!rows || !rows.length) { paint('<div class="rtglb-msg">No all-time results yet.</div>'); return; }
      var st = (B.state && B.state()) || {};
      var html = rowsHTML(rows, st.name || null, null) +
        '<div class="rtglb-foot">Every player’s single best result, all time.</div>';
      lastHTML.all = html; paint(html);
    }).catch(function () { busyBar(false);
      if (!lastHTML.all) paint('<div class="rtglb-msg">Couldn’t load the all-time board.</div>'); });
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
      try {
        if (window.RTG_BOARD && RTG_BOARD.onChange) RTG_BOARD.onChange(function () { if (!busy) render(); });
      } catch (e) {}
    },
    open: open, close: close,
    refresh: function () { cache = {}; render(); },
    setDate: function (d) { if (CFG) { CFG.date = d; cache = {}; render(); } }
  };
})();
