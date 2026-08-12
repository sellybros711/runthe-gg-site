/* alltime.js - self-mounting All-Time Leaders board, appended under each game's
 * Daily Leaderboard (#lb) on every arcade game page.
 *
 * It reads RTG_BOARD.allTimeBoard(game) - the same public RPC the cardholder
 * pregame screen uses - and shows each player's BEST result ever with the DATE
 * they set it. Run games (table/career/oddone/rankit/almamater) show the longest
 * run; the timed games (match/guess/crossword/wordsearch) show the fastest time.
 *
 * Fails soft in every direction: no #lb, no RTG_BOARD, RPC not deployed, or
 * offline - the block just doesn't appear (or shows a quiet "unavailable"). It
 * never touches the daily board, the game, or a finished puzzle. Because the RPC
 * is anon-granted it works signed-out too; it retries on the first RTG_BOARD
 * state change so it fills even when this script runs before board.js boots.
 */
(function () {
  'use strict';

  function gameKey() { var m = (location.pathname || '').match(/\/arcade\/([a-z]+)\//); return m ? m[1] : null; }
  var GAME = gameKey();
  // timed:true -> fastest base_seconds; else longest run_len, labelled `unit`.
  var CFG = {
    table:      { timed: false, unit: 'in a row' },
    career:     { timed: false, unit: 'in a row' },
    oddone:     { timed: false, unit: 'in a row' },
    rankit:     { timed: false, unit: 'sets' },
    almamater:  { timed: false, unit: 'in a row' },
    highlow:    { timed: false, unit: 'in a row' },
    sportegories: { timed: false, unit: 'pts' },
    match:      { timed: true },
    guess:      { timed: true },
    crossword:  { timed: true },
    wordsearch: { timed: true }
  };
  var C = GAME && CFG[GAME];
  if (!C) return;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(s) { if (!s) return ''; var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return ''; return MON[(+m[2]) - 1] + ' ' + (+m[3]); }
  function fmtTime(s) { s = Math.max(0, Math.round(+s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function styles() {
    if (document.getElementById('rtg-at-style')) return;
    var s = document.createElement('style'); s.id = 'rtg-at-style';
    s.textContent = [
      '.rtg-at{margin-top:16px;padding-top:14px;border-top:1px solid var(--line2,rgba(244,247,251,.15));}',
      '.rtg-at h4{margin:0 0 9px;font-family:var(--hero,inherit);font-weight:400;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink,#F4F7FB);}',
      '.rtg-at .arow{display:flex;align-items:center;gap:9px;padding:6px 0;font-size:13px;border-bottom:1px solid var(--line,rgba(244,247,251,.06));}',
      '.rtg-at .arow:last-child{border-bottom:0;}',
      '.rtg-at .ark{font-weight:900;color:var(--mut,#A9B8CB);width:16px;flex:0 0 auto;text-align:center;}',
      '.rtg-at .awho{flex:1;min-width:0;font-weight:700;color:var(--ink,#F4F7FB);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.rtg-at .adate{font-size:11px;font-weight:700;color:var(--mut,#A9B8CB);flex:0 0 auto;white-space:nowrap;}',
      '.rtg-at .atm{font-weight:900;color:var(--ink,#F4F7FB);flex:0 0 auto;min-width:52px;text-align:right;}',
      '.rtg-at .aempty{font-size:12px;color:var(--mut,#A9B8CB);padding:6px 0;font-weight:600;}'
    ].join('');
    document.head.appendChild(s);
  }

  var loaded = false;

  function fill() {
    var body = document.getElementById('rtgAtBody'); if (!body) return;
    if (!(window.RTG_BOARD && RTG_BOARD.allTimeBoard)) { if (!loaded) body.innerHTML = '<div class="aempty">All-time board unavailable.</div>'; return; }
    RTG_BOARD.allTimeBoard(GAME, 10).then(function (rows) {
      body = document.getElementById('rtgAtBody'); if (!body) return;
      if (rows === null) { return; }               // offline / not booted yet - retry on next onChange
      loaded = true;
      if (!rows.length) { body.innerHTML = '<div class="aempty">Be the first on the all-time board!</div>'; return; }
      var me = (RTG_BOARD.state && RTG_BOARD.state().name || '').toLowerCase();
      body.innerHTML = rows.map(function (r, i) {
        var nm = r.display_name || 'Player';
        var amt = C.timed ? fmtTime(r.base_seconds) : ((r.run_len || 0) + ' ' + C.unit);
        var dt = fmtDate(r.played_on);
        return '<div class="arow' + (me && nm.toLowerCase() === me ? ' you' : '') + '">' +
          '<span class="ark">' + (i + 1) + '</span>' +
          '<span class="awho">' + esc(nm) + '</span>' +
          (dt ? '<span class="adate">' + esc(dt) + '</span>' : '') +
          '<span class="atm">' + esc(amt) + '</span></div>';
      }).join('');
    }).catch(function () {});
  }

  function mount() {
    var lb = document.getElementById('lb'); if (!lb) return;
    if (document.getElementById('rtgAt')) return;
    styles();
    var box = document.createElement('div'); box.className = 'rtg-at'; box.id = 'rtgAt';
    box.innerHTML = '<h4>All-Time Leaders</h4><div id="rtgAtBody"><div class="aempty">Loading…</div></div>';
    lb.appendChild(box);
    fill();
    if (window.RTG_BOARD && RTG_BOARD.onChange) RTG_BOARD.onChange(function (st) {
      if (loaded) return;
      fill();
      // Board booted but the RPC is unreachable (not deployed / offline): don't
      // sit on "Loading…" forever - say so once we know we're offline.
      if (st && st.offline) { var b = document.getElementById('rtgAtBody'); if (b && !loaded) b.innerHTML = '<div class="aempty">All-time board unavailable.</div>'; }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
