/* RunThe.GG — per-sport version picker for Pro (shared).
 *
 * FREE users always play the mixed "All Sports" game (nothing changes).
 * PRO users (and, while TESTING, everyone) choose one of four daily versions
 * before a game starts: All / NBA / NFL / MLB. Each version is its own daily
 * puzzle, leaderboard and day-streak, achieved by mode-keying the game's ids:
 *   - 'all'  -> base ids unchanged (so existing boards/streaks/saves carry over)
 *   - sport  -> base + '_' + mode  (e.g. 'career_nba')
 * and the daily seed via seed(): 'career-2026-08-05' vs 'career-nba-2026-08-05'.
 *
 * A game asks RTGMode.choose(base,{title}) once at boot; it resolves to a mode
 * key (silently 'all' for free users / archive). Everything is guarded, so a
 * missing tokens.js just yields 'all'. window.RTGMode.
 */
(function () {
  'use strict';
  var LS = window.localStorage;
  var MODES = [
    { k: 'all', label: 'All Sports', sub: 'NBA · NFL · MLB mixed', sport: null, c: 'var(--gold,#F2B632)' },
    { k: 'nba', label: 'NBA', sub: 'Basketball only', sport: 'NBA', c: '#F0653A' },
    { k: 'nfl', label: 'NFL', sub: 'Football only', sport: 'NFL', c: '#5FA052' },
    { k: 'mlb', label: 'MLB', sub: 'Baseball only', sport: 'MLB', c: '#2F6BFF' }
  ];
  var BY = {}; MODES.forEach(function (m) { BY[m.k] = m; });

  function eligible() {
    try { var T = window.RTGTokens; return !!(T && (T.isPro() || (T.testing && T.testing()))); }
    catch (e) { return false; }
  }
  function sportOf(mode) { return (BY[mode] && BY[mode].sport) || null; }
  function key(base, mode) { return (!mode || mode === 'all') ? base : (base + '_' + mode); }
  function seed(base, mode, date) { return (!mode || mode === 'all') ? (base + '-' + date) : (base + '-' + mode + '-' + date); }
  function lastKey(base) { return 'rtg:mode:' + base; }
  function last(base) { try { var v = LS.getItem(lastKey(base)); return BY[v] ? v : 'all'; } catch (e) { return 'all'; } }
  function remember(base, mode) { try { LS.setItem(lastKey(base), mode); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function ensureStyle() {
    if (document.getElementById('rtg-mode-css')) return;
    var s = document.createElement('style'); s.id = 'rtg-mode-css';
    s.textContent =
      '.rtgm-scrim{position:fixed;inset:0;background:rgba(3,9,18,.72);backdrop-filter:blur(4px);z-index:120;display:flex;align-items:center;justify-content:center;padding:20px;animation:rtgm-fade .18s ease;}' +
      '@keyframes rtgm-fade{from{opacity:0}to{opacity:1}}' +
      '.rtgm-sheet{width:100%;max-width:380px;background:var(--card,#10233A);border:1px solid var(--line2,rgba(255,255,255,.15));border-radius:16px;padding:22px 20px;position:relative;box-shadow:0 30px 80px -20px rgba(0,0,0,.7);text-align:center;color:var(--ink,#F4F7FB);font-family:var(--f,system-ui,sans-serif);}' +
      '.rtgm-pill{position:absolute;top:14px;right:14px;font-size:9px;font-weight:900;letter-spacing:.12em;color:#20180A;background:var(--gold,#F2B632);border-radius:999px;padding:3px 9px;}' +
      '.rtgm-h{font-family:var(--hero,inherit);font-weight:400;font-size:22px;margin:2px 0 4px;text-transform:uppercase;letter-spacing:.02em;color:var(--ink,#F4F7FB);}' +
      '.rtgm-sub{font-size:12.5px;color:var(--mut,#A9B8CB);margin:0 0 16px;line-height:1.45;font-weight:600;}' +
      '.rtgm-opts{display:flex;flex-direction:column;gap:9px;}' +
      '.rtgm-opt{display:flex;flex-direction:column;align-items:flex-start;gap:2px;border:1.5px solid var(--line2,rgba(255,255,255,.15));border-left:5px solid var(--mc);border-radius:12px;background:var(--card2,#162B44);color:var(--ink,#F4F7FB);padding:12px 14px;cursor:pointer;text-align:left;font-family:inherit;transition:border-color .12s,transform .08s,background .12s;}' +
      '.rtgm-opt:hover{border-color:var(--mc);}' +
      '.rtgm-opt.on{border-color:var(--mc);background:color-mix(in srgb, var(--mc) 15%, var(--card2,#162B44));}' +
      '.rtgm-opt:active{transform:scale(.995);}' +
      '.rtgm-lab{font-weight:900;font-size:16px;}' +
      '.rtgm-msub{font-size:11px;font-weight:700;color:var(--mut,#A9B8CB);text-transform:uppercase;letter-spacing:.05em;}';
    document.head.appendChild(s);
  }

  // choose(base,{title}) -> Promise<mode>. Free/archive resolve to 'all' with no UI.
  function choose(base, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!eligible()) { resolve('all'); return; }
      ensureStyle();
      var def = last(base), title = opts.title || 'today’s game';
      var scr = document.createElement('div'); scr.className = 'rtgm-scrim';
      scr.innerHTML =
        '<div class="rtgm-sheet" role="dialog" aria-label="Choose version">' +
          '<div class="rtgm-pill">PRO</div>' +
          '<h2 class="rtgm-h">Choose your version</h2>' +
          '<p class="rtgm-sub">Pick which ' + esc(title) + ' to play today. Each version has its own board and streak.</p>' +
          '<div class="rtgm-opts">' + MODES.map(function (m) {
            return '<button class="rtgm-opt' + (m.k === def ? ' on' : '') + '" type="button" data-k="' + m.k + '" style="--mc:' + m.c + '">' +
              '<span class="rtgm-lab">' + esc(m.label) + '</span><span class="rtgm-msub">' + esc(m.sub) + '</span></button>';
          }).join('') + '</div>' +
        '</div>';
      document.body.appendChild(scr);
      function pick(k) { remember(base, k); scr.remove(); resolve(k); }
      [].forEach.call(scr.querySelectorAll('.rtgm-opt'), function (b) {
        b.addEventListener('click', function () { pick(b.dataset.k); });
      });
    });
  }

  window.RTGMode = { MODES: MODES, eligible: eligible, sportOf: sportOf, key: key, seed: seed, last: last, choose: choose };
})();
