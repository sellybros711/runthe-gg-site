/* leaderboard.js — the shared arcade leaderboard (window.RTG_LB).
 *
 * Every game used to carry its own ~20-line renderRealBoard() and its own
 * markup, so the boards drifted apart and none of them answered the questions
 * a player actually has. This is one component for all ten games:
 *
 *   - Today / All-time tabs in the rail itself, not a separate screen.
 *   - Where YOU stand: rank, field size and percentile, and how far off the
 *     next place you are. A top-5 list tells you nothing if you're 23rd.
 *   - Your row is pinned into the list with its neighbours when you're outside
 *     the visible top, so there's always context.
 *   - Honest states: a skeleton while loading, a real empty state, a signed-out
 *     prompt, and an offline note - never fake sample players.
 *
 * Usage from a game page:
 *   RTG_LB.mount({ el: document.querySelector('.lb'), game: 'table',
 *                  date: DATE, kind: 'run', unit: 'in a row' });
 *   RTG_LB.refresh();     // after submitting a result
 *
 * kind: 'run'  - higher run_len wins (streak games), value shown as "N unit"
 *       'time' - lower seconds wins (time games), value shown as m:ss
 *       'pts'  - higher run_len wins, shown as "N pts"
 * Self-contained: injects its own CSS, uses the page's --accent when given one,
 * and degrades to a quiet note if board.js is missing.
 */
(function () {
  'use strict';
  if (window.RTG_LB) return;

  var CFG = null, host = null, tab = 'today', busy = false, cache = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtTime(s) { s = Math.max(0, Math.round(+s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function ord(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* One row's headline value, in that game's own language. */
  function valueOf(row) {
    if (!row) return '';
    if (CFG.kind === 'time') return fmtTime(row.base_seconds);
    var n = row.run_len == null ? 0 : row.run_len;
    return n + (CFG.unit ? ' ' + CFG.unit : '');
  }
  /* Lower score is always better in grid_runs, whatever the game. */
  function better(a, b) { return (a.score || 0) - (b.score || 0); }

  // ---------------------------------------------------------------- styles
  function styles() {
    if (document.getElementById('rtglb-css')) return;
    var s = document.createElement('style'); s.id = 'rtglb-css';
    s.textContent = [
      '.rtglb{--lba:var(--accent,var(--coralT,#F06A5F));}',
      '.rtglb-h{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}',
      '.rtglb-h h3{font-family:var(--hero,inherit);font-weight:400;letter-spacing:.03em;text-transform:uppercase;',
      '  font-size:14px;color:var(--lba);margin:0;flex:0 0 auto;}',
      '.rtglb-tabs{margin-left:auto;display:inline-flex;background:var(--card2,#162B44);border:1px solid var(--line2,rgba(255,255,255,.15));',
      '  border-radius:999px;padding:2px;gap:2px;}',
      '.rtglb-tabs button{appearance:none;border:0;background:transparent;cursor:pointer;font-family:inherit;',
      '  font-size:10.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--mut,#A9B8CB);',
      '  padding:5px 11px;border-radius:999px;min-height:28px;}',
      '.rtglb-tabs button.on{background:var(--lba);color:#0A1728;}',
      ':root[data-theme="light"] .rtglb-tabs button.on{color:#fff;}',

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
      '.rtglb-rows li{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:13px;',
      '  border-top:1px solid var(--line,rgba(255,255,255,.08));color:var(--ink,#F4F7FB);}',
      '.rtglb-rows li:first-child{border-top:0;}',
      '.rtglb-rows .rtglb-rk{flex:0 0 22px;font-family:var(--hero,inherit);font-weight:400;color:var(--mut,#A9B8CB);',
      '  font-variant-numeric:tabular-nums;text-align:center;}',
      '.rtglb-rows .rtglb-who{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}',
      '.rtglb-rows .rtglb-val{font-variant-numeric:tabular-nums;color:var(--lba);font-weight:800;flex:0 0 auto;}',
      '.rtglb-rows li.rtglb-me{color:var(--lba);}',
      '.rtglb-rows li.rtglb-me .rtglb-who{font-weight:900;}',
      '.rtglb-rows li.rtglb-me .rtglb-rk{color:var(--lba);}',
      '.rtglb-rows .rtglb-medal{font-size:14px;line-height:1;}',
      '.rtglb-rows li.rtglb-split{border-top:1px dashed var(--line2,rgba(255,255,255,.15));color:var(--dim,#7C8DA3);',
      '  justify-content:center;font-size:11px;letter-spacing:.3em;padding:5px 0;}',
      '.rtglb-rows .rtglb-fl{font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--greenT,#48D17A);}',

      /* states */
      '.rtglb-sk{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line,rgba(255,255,255,.08));}',
      '.rtglb-sk:first-child{border-top:0;}',
      '.rtglb-sk i{display:block;height:10px;border-radius:999px;background:var(--card3,#1A3350);animation:rtglbsk 1.2s ease-in-out infinite;}',
      '.rtglb-sk i.a{width:20px;} .rtglb-sk i.b{flex:1;} .rtglb-sk i.c{width:52px;}',
      '@keyframes rtglbsk{0%,100%{opacity:.45;}50%{opacity:.9;}}',
      '.rtglb-msg{font-size:12.5px;color:var(--mut,#A9B8CB);line-height:1.5;padding:6px 0 2px;}',
      '.rtglb-msg b{color:var(--ink,#F4F7FB);}',
      '.rtglb-foot{font-size:11px;color:var(--mut,#A9B8CB);margin-top:9px;line-height:1.5;}',
      '.rtglb-cta{appearance:none;cursor:pointer;margin-top:9px;width:100%;background:var(--lba);color:#0A1728;border:0;',
      '  border-radius:10px;padding:10px;font-family:inherit;font-weight:900;font-size:12.5px;}',
      ':root[data-theme="light"] .rtglb-cta{color:#fff;}',
      '@media (prefers-reduced-motion: reduce){.rtglb-sk i{animation:none;}.rtglb-you .rtglb-bar i{transition:none;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------------------------------------------------------------- render
  function skeleton(n) {
    var h = '';
    for (var i = 0; i < (n || 5); i++) h += '<div class="rtglb-sk"><i class="a"></i><i class="b"></i><i class="c"></i></div>';
    return h;
  }
  function shell(inner, tabsOn) {
    return '<div class="rtglb-h"><h3>' + (tab === 'today' ? 'Today' : 'All-time') + ' leaderboard</h3>' +
      (tabsOn === false ? '' :
        '<div class="rtglb-tabs"><button type="button" data-tab="today"' + (tab === 'today' ? ' class="on"' : '') + '>Today</button>' +
        '<button type="button" data-tab="all"' + (tab === 'all' ? ' class="on"' : '') + '>All-time</button></div>') +
      '</div>' + inner;
  }
  /* Games still write their own stats into the rail's old ids (#yourBest,
   * #lbSample, ...) and most do it unguarded, so simply replacing the markup
   * would throw inside their result code. Keep those ids alive as hidden stubs:
   * the legacy writes land harmlessly and no game file has to change. */
  var keepIds = [];
  function captureIds() {
    keepIds = [];
    [].forEach.call(host.querySelectorAll('[id]'), function (el) { keepIds.push(el.id); });
  }
  function restoreStubs() {
    for (var i = 0; i < keepIds.length; i++) {
      if (document.getElementById(keepIds[i])) continue;
      var st = document.createElement('span');
      st.id = keepIds[i]; st.style.display = 'none';
      host.appendChild(st);
    }
  }

  function paint(html, tabsOn) {
    host.innerHTML = shell(html, tabsOn);
    restoreStubs();
    [].forEach.call(host.querySelectorAll('.rtglb-tabs button'), function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-tab'); if (t === tab) return;
        tab = t; render();
      });
    });
    var cta = host.querySelector('.rtglb-cta');
    if (cta) cta.addEventListener('click', function () {
      try { if (window.RTGAuthUI) RTGAuthUI.open('signin'); } catch (e) {}
    });
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
        (r.flawless ? '<span class="rtglb-fl">Clean</span>' : '') +
        '<span class="rtglb-val">' + esc(valueOf(r)) + '</span></li>';
    });
    // If you finished outside the rows above, pin your own line on the end so
    // the board always says where you actually stand.
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
    // Distance to the place directly above — only when that player is actually
    // on screen. Outside the visible rows we don't know who's in rank-1, and
    // measuring against the last visible row would quote a gap to the wrong
    // person entirely ("+5 takes 22nd" when +5 would really take 5th).
    var above = (rank > 1 && rank <= rows.length) ? rows[rank - 2] : null;
    if (above) {
      if (CFG.kind === 'time') {
        var d = Math.max(0, Math.round((mine.base_seconds || 0) - (above.base_seconds || 0)));
        if (d > 0) gap = '<b>' + d + 's</b> faster takes ' + ord(rank - 1);
      } else {
        var dd = Math.max(0, (above.run_len || 0) - (mine.run_len || 0));
        if (dd > 0) gap = '<b>+' + dd + '</b> ' + (CFG.unit || 'more') + ' takes ' + ord(rank - 1);
      }
    }
    return '<div class="rtglb-you">' +
      '<div class="rtglb-top"><span class="rtglb-rk">' + ord(rank) + '</span>' +
      '<span class="rtglb-of">of ' + total + ' today</span>' +
      '<span class="rtglb-pctl">' + lead + '</span></div>' +
      '<div class="rtglb-bar"><i style="width:' + fill + '%"></i></div>' +
      (gap ? '<div class="rtglb-gap">' + gap + '</div>' : '') +
      '</div>';
  }

  // ---------------------------------------------------------------- data
  function render() {
    if (!host || !CFG) return;
    styles();
    var B = window.RTG_BOARD;
    if (!B || !B.leaderboard) { paint('<div class="rtglb-msg">Leaderboard unavailable.</div>', false); return; }
    paint(skeleton(5));
    if (tab === 'all') { renderAll(); return; }

    busy = true;
    var st = (B.state && B.state()) || {};
    var jobs = [
      B.leaderboard(CFG.game, CFG.date, CFG.limit || 5),
      B.playerCount ? B.playerCount(CFG.game, CFG.date) : Promise.resolve(null),
      (B.myRun && st.signedIn) ? B.myRun(CFG.game, CFG.date) : Promise.resolve(null)
    ];
    Promise.all(jobs).then(function (res) {
      busy = false;
      var rows = res[0], total = res[1], mine = res[2];
      cache.mine = mine;
      if (rows === null) { paint('<div class="rtglb-msg">Board unavailable offline. Your result is saved and will post when you reconnect.</div>'); return; }
      if (!rows.length) {
        paint('<div class="rtglb-msg"><b>Nobody has posted today.</b> Finish the puzzle and you’ll be first on the board.</div>' +
          (st.signedIn ? '' : '<button class="rtglb-cta" type="button">Sign in to compete</button>'));
        return;
      }
      var myName = st.name || null;
      var done = function (myRank) {
        paint(youHTML(myRank, total || rows.length, mine, rows) +
          rowsHTML(rows, myName, myRank) +
          '<div class="rtglb-foot">' + footNote(total) + '</div>' +
          (st.signedIn ? '' : '<button class="rtglb-cta" type="button">Sign in to join the board</button>'));
      };
      if (mine && B.rank) B.rank(CFG.game, CFG.date, mine.score).then(done);
      else done(null);
    }).catch(function () {
      busy = false;
      paint('<div class="rtglb-msg">Couldn’t load the board. It’ll retry shortly.</div>');
    });
  }

  function footNote(total) {
    var what = CFG.kind === 'time' ? 'Fastest clean solve wins' :
      (CFG.kind === 'pts' ? 'Most points wins, ties broken by time' : 'Longest run wins, ties broken by time');
    return what + (total ? ' · <b>' + total + '</b> played today' : '') + '. Resets at midnight.';
  }

  function renderAll() {
    var B = window.RTG_BOARD;
    if (!B.allTimeBoard) { paint('<div class="rtglb-msg">All-time board unavailable.</div>'); return; }
    Promise.resolve(B.allTimeBoard(CFG.game, 10)).then(function (rows) {
      if (!rows || !rows.length) { paint('<div class="rtglb-msg">No all-time results yet.</div>'); return; }
      var st = (B.state && B.state()) || {};
      var myName = st.name || null;
      var h = '<ol class="rtglb-rows">';
      var MED = ['🥇', '🥈', '🥉'];
      rows.forEach(function (r, i) {
        var mine = myName && r.display_name && r.display_name.toLowerCase() === myName.toLowerCase();
        h += '<li class="' + (mine ? 'rtglb-me' : '') + '">' +
          '<span class="rtglb-rk">' + (i < 3 ? '<span class="rtglb-medal">' + MED[i] + '</span>' : (i + 1)) + '</span>' +
          '<span class="rtglb-who">' + esc(r.display_name || 'Player') + (mine ? ' (you)' : '') + '</span>' +
          '<span class="rtglb-val">' + esc(valueOf(r)) + '</span></li>';
      });
      h += '</ol><div class="rtglb-foot">Every player’s single best result, all time.</div>';
      paint(h);
    }).catch(function () { paint('<div class="rtglb-msg">Couldn’t load the all-time board.</div>'); });
  }

  // ---------------------------------------------------------------- api
  window.RTG_LB = {
    mount: function (cfg) {
      CFG = cfg || {};
      host = CFG.el || document.querySelector('.lb') || document.querySelector('.mlb');
      if (!host) return;
      host.classList.add('rtglb');
      captureIds();
      styles(); render();
      try {
        if (window.RTG_BOARD && RTG_BOARD.onChange) RTG_BOARD.onChange(function () { if (!busy) render(); });
      } catch (e) {}
    },
    refresh: function () { cache = {}; render(); },
    setDate: function (d) { if (CFG) { CFG.date = d; cache = {}; render(); } }
  };
})();
