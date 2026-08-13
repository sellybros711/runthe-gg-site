/* RunThe.GG - per-sport version picker for Pro (shared).
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

  // NB: the switcher row's height is reserved by each game's own inline CSS
  // (`.modesw:empty{min-height:...}`), not from here. mode.js loads behind a
  // megabyte of corpus data, so anything it injects lands well after the first
  // paint - far too late to stop the fill from shoving the board down a row.
  function ensureStyle() {
    if (document.getElementById('rtg-mode-css')) return;
    var s = document.createElement('style'); s.id = 'rtg-mode-css';
    s.textContent =
      '.rtgm-scrim{position:fixed;inset:0;background:rgba(3,9,18,.72);backdrop-filter:blur(4px);z-index:120;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;animation:rtgm-fade .18s ease;}' +
      '@keyframes rtgm-fade{from{opacity:0}to{opacity:1}}' +
      '.rtgm-sheet{width:100%;max-width:380px;background:var(--card,#10233A);border:1px solid var(--line2,rgba(255,255,255,.15));border-radius:16px;padding:22px 20px;position:relative;box-shadow:0 30px 80px -20px rgba(0,0,0,.7);text-align:center;max-height:92dvh;overflow:auto;color:var(--ink,#F4F7FB);font-family:var(--f,system-ui,sans-serif);}' +
      '.rtgm-pill{position:absolute;top:14px;right:14px;font-size:9px;font-weight:900;letter-spacing:.12em;color:var(--onAccent,#160B02);background:var(--brand,#FF8A3D);border-radius:999px;padding:3px 9px;}' +
      '.rtgm-h{font-family:var(--hero,inherit);font-weight:400;font-size:22px;margin:2px 0 4px;text-transform:uppercase;letter-spacing:.02em;color:var(--ink,#F4F7FB);}' +
      '.rtgm-sub{font-size:12.5px;color:var(--mut,#A9B8CB);margin:0 0 16px;line-height:1.45;font-weight:600;}' +
      '.rtgm-opts{display:flex;flex-direction:column;gap:9px;}' +
      '.rtgm-opt{display:flex;flex-direction:column;align-items:flex-start;gap:2px;border:1.5px solid var(--line2,rgba(255,255,255,.15));border-left:5px solid var(--mc);border-radius:12px;background:var(--card2,#162B44);color:var(--ink,#F4F7FB);padding:12px 14px;cursor:pointer;text-align:left;font-family:inherit;transition:border-color .12s,transform .08s,background .12s;}' +
      '.rtgm-opt:hover{border-color:var(--mc);}' +
      '.rtgm-opt.on{border-color:var(--mc);background:color-mix(in srgb, var(--mc) 15%, var(--card2,#162B44));}' +
      '.rtgm-opt:active{transform:scale(.995);}' +
      '.rtgm-lab{font-weight:900;font-size:16px;}' +
      '.rtgm-msub{font-size:11px;font-weight:700;color:var(--mut,#A9B8CB);text-transform:uppercase;letter-spacing:.05em;}' +
      '.rtgm-opt.lk{opacity:.55;cursor:pointer;}' +
      '.rtgm-opt.lk .rtgm-lab::after{content:"";display:inline-block;width:12px;height:12px;margin-left:6px;vertical-align:-1px;background-color:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath fill=%27black%27 d=%27M6 10V7a6 6 0 0 1 12 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h8V7a4 4 0 0 0-8 0z%27/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath fill=%27black%27 d=%27M6 10V7a6 6 0 0 1 12 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h8V7a4 4 0 0 0-8 0z%27/%3E%3C/svg%3E") center/contain no-repeat;}' +
      '.rtgm-lk{width:12px;height:12px;vertical-align:-1px;margin-left:5px;}' +
      '.rtgm-cta{margin-top:14px;width:100%;border:0;border-radius:11px;background:var(--brand,#FF8A3D);color:var(--onAccent,#160B02);font-weight:900;font-size:14px;padding:13px;min-height:46px;cursor:pointer;font-family:inherit;}' +
      '.rtgm-cta:disabled{opacity:.6;cursor:default;}' +
      '.rtgm-fine{font-size:10.5px;color:var(--mut,#A9B8CB);margin:9px 0 0;font-weight:600;line-height:1.4;}' +
      '.rtgm-x{position:absolute;top:12px;left:12px;width:32px;height:32px;border-radius:50%;border:1px solid var(--line2,rgba(255,255,255,.15));background:var(--card2,#162B44);color:var(--ink,#F4F7FB);font-size:13px;cursor:pointer;}';
    document.head.appendChild(s);
  }

  // Pro upsell: shown when a FREE user taps a locked sport version. Reuses the
  // archive gate's checkout flow (POST /api/stripe/checkout with the signed-in
  // Supabase user id); asks for sign-in first when signed out.
  function showUpsell(title) {
    ensureStyle();
    var scr = document.createElement('div'); scr.className = 'rtgm-scrim';
    scr.innerHTML =
      '<div class="rtgm-sheet" role="dialog" aria-label="Arcade Card">' +
        '<button class="rtgm-x" type="button" aria-label="Close">✕</button>' +
        '<div class="rtgm-pill">ARCADE CARD</div>' +
        '<h2 class="rtgm-h">Play every version</h2>' +
        '<p class="rtgm-sub">The Arcade Card unlocks an NBA-only, NFL-only and MLB-only edition of ' + esc(title || 'each game') + ', each with its own daily board and streak, plus unlimited plays and the full archive.</p>' +
        '<div class="rtgm-opts">' + MODES.filter(function (m) { return m.k !== 'all'; }).map(function (m) {
          return '<div class="rtgm-opt lk" style="--mc:' + m.c + '"><span class="rtgm-lab">' + esc(m.label) + '</span><span class="rtgm-msub">' + esc(m.sub) + '</span></div>';
        }).join('') + '</div>' +
        '<button class="rtgm-cta" type="button">Get Arcade Card</button>' +
        '<p class="rtgm-fine">Cancel anytime. Your free All-Sports streaks are untouched.</p>' +
      '</div>';
    document.body.appendChild(scr);
    function close() { scr.remove(); }
    scr.addEventListener('click', function (e) { if (e.target === scr) close(); });
    scr.querySelector('.rtgm-x').addEventListener('click', close);
    var cta = scr.querySelector('.rtgm-cta'), fine = scr.querySelector('.rtgm-fine');
    cta.addEventListener('click', function () {
      // Hand off to the one canonical purchase surface (card.js): correct
      // plan selection, visible prices, consistent "Arcade Card" branding.
      // Signed-out users get the sign-in modal instead of a dead end.
      var st = (window.RTG_BOARD && window.RTG_BOARD.state()) || {};
      if (!st.signedIn && window.RTGAuthUI) { close(); RTGAuthUI.open('signup'); return; }
      if (window.RTGCard && RTGCard.paywall) { close(); RTGCard.paywall({ reason: 'upsell' }); return; }
      fine.textContent = 'Checkout isn’t live yet. Check back soon.';
    });
  }

  // Free users: fill the (otherwise hidden) #modesw strip with a locked
  // switcher - All active, sport versions padlocked, tap → upsell. Games hide
  // the strip synchronously at boot for free users, so we fill it after.
  function mountLockedSwitcher() {
    try {
      if (eligible()) return;
      // Archive practice never gets a switcher, so collapse the reserved row
      // rather than leaving the held space empty forever.
      if (window.RTGArchive && window.RTGArchive.active && window.RTGArchive.active()) {
        var ael = document.getElementById('modesw'); if (ael) ael.classList.add('gone');
        return;
      }
      var el = document.getElementById('modesw'); if (!el || el.dataset.rtgmLocked) return;
      el.dataset.rtgmLocked = '1';
      el.classList.remove('hidden'); el.classList.remove('gone');
      el.innerHTML = MODES.map(function (m) {
        return '<button type="button" data-k="' + m.k + '" class="' + (m.k === 'all' ? 'on' : '') + '"' +
          (m.k === 'all' ? '' : ' aria-label="' + esc(m.label) + ' version, Pro feature" style="opacity:.55"') + '>' +
          esc(m.label) + (m.k === 'all' ? '' : ' <svg class="rtgm-lk" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="vertical-align:-1px;margin-left:4px"><path d="M6 10V7a6 6 0 0 1 12 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h8V7a4 4 0 0 0-8 0z"/></svg>') + '</button>';
      }).join('');
      var title = (document.title.split('|')[0] || '').replace(/Run The Arcade:?/i, '').trim() || 'this game';
      [].forEach.call(el.querySelectorAll('button'), function (b) {
        if (b.dataset.k === 'all') return;
        b.addEventListener('click', function () { showUpsell(title); });
      });
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(mountLockedSwitcher, 600); });
  } else { setTimeout(mountLockedSwitcher, 600); }

  // choose(base,{title}) -> Promise<mode>. No pre-game modal any more: the game
  // boots straight into the last version you played (or All Sports), and members
  // switch versions from the inline All/NBA/NFL/MLB switcher tabs at the top.
  // Free/archive resolve to 'all'.
  function choose(base) {
    return Promise.resolve(eligible() ? last(base) : 'all');
  }

  window.RTGMode = { MODES: MODES, eligible: eligible, sportOf: sportOf, key: key, seed: seed, last: last, choose: choose, upsell: showUpsell };
})();
