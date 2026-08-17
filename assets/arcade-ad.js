/* ============================================================================
 * RUN THE ARCADE — the house ad, once, for the whole site.
 *
 * WHY THIS IS ONE FILE AND NOT FOUR. It started as four: the homepage, the NFL
 * game, the college game and the golf game each grew their own panel, each with
 * its own look and -- the part that actually hurt -- its own storage keys. A
 * player going homepage -> NFL -> college -> golf in one sitting was told about
 * the Arcade four times, and "Don't show this again" only ever silenced the one
 * they ticked it on. Four ads that look the same and appear four times is worse
 * than four that look different, not better, so the look and the remembering had
 * to move to the same place.
 *
 * Each page still decides WHEN it is polite to ask -- that judgement is local
 * (golf will not interrupt a round, the NFL game will not cover the club picker,
 * the homepage will not stack on the sign-in sheet). This file owns what the
 * panel looks like, and whether the player has already been asked.
 *
 * SELF-CONTAINED ON PURPOSE. It injects its own stylesheet and its own markup
 * and reads nothing from the host page: no CSS custom properties, no helper
 * functions, no framework. Four pages with four different design systems can
 * include one <script> and get the identical panel, which is the whole point.
 *
 *   <script defer src="/assets/arcade-ad.js"></script>
 *
 *   RTG_ARCADE_AD.due()      -- storage says it is allowed to show
 *   RTG_ARCADE_AD.show(opts) -- show it. opts.from names the surface for analytics.
 *   RTG_ARCADE_AD.forced()   -- the page was opened with ?arcadead=1
 *
 * ========================================================================== */
(function () {
  'use strict';
  if (window.RTG_ARCADE_AD) return;              // a page that includes it twice

  var URL_ARCADE = '/arcade/';
  /* ONE SET OF KEYS FOR THE WHOLE SITE. Both stores are scoped to the ORIGIN and
     not the path, so /, /football/, /cfb/ and /golf/ genuinely share them. That is
     what makes the tickbox mean what it says everywhere. */
  var OFF  = 'rtg_arcade_ad_off';    // localStorage   — "never again"
  var SEEN = 'rtg_arcade_ad_seen';   // sessionStorage — shown in this tab
  var AT   = 'rtg_arcade_ad_at';     // localStorage   — when, so other TABS know

  /* THIRTY MINUTES, ACROSS TABS. sessionStorage alone is per-tab, so somebody with
     the homepage and two games open in three tabs would be told three times -- the
     one case a session flag cannot see. The timestamp closes it: long enough that a
     trip to the Arcade and back is one visit, short enough that coming back after
     dinner is a new one. */
  var WINDOW_MS = 30 * 60 * 1000;

  /* Safari in private mode THROWS on both stores rather than returning null. Every
     read defaults to "not seen, not opted out" and every write is allowed to fail:
     an ad shown once a visit to somebody whose browser refuses to remember is a far
     smaller wrong than a script error taking a game's boot down with it. */
  function get(store, key) { try { return window[store].getItem(key); } catch (e) { return null; } }
  function set(store, key, v) { try { window[store].setItem(key, v); } catch (e) {} }
  function del(store, key) { try { window[store].removeItem(key); } catch (e) {} }
  function track(ev, p) { try { if (typeof gtag === 'function') gtag('event', ev, p || {}); } catch (e) {} }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function isOff() { return get('localStorage', OFF) === '1'; }
  function seenThisSession() { return get('sessionStorage', SEEN) === '1'; }
  function shownRecently() {
    var at = Number(get('localStorage', AT));
    return isFinite(at) && at > 0 && (Date.now() - at) < WINDOW_MS;
  }
  function due() { return !isOff() && !seenThisSession() && !shownRecently(); }

  /* Burnt once, however the panel goes away. Called after the panel has SURVIVED a
     beat on screen, and immediately on any interaction with it -- see show(). */
  function markSeen() {
    if (seenThisSession()) return;
    set('sessionStorage', SEEN, '1');
    set('localStorage', AT, String(Date.now()));
  }

  /* THE TEN GAMES, EACH IN ITS OWN ARCADE TILE COLOUR, so the ad looks like the
     product it is selling rather than like a wall of orange. Naming them is the
     point: "ten daily puzzles" is a quantity, "Alma Mater, Rank It, High Low" is a
     reason to tap, and one of the ten is always somebody's sort of thing. */
  var GAMES = [
    ['Common Ground', '#5C8CFF'], ['Crossword', '#9CADC0'], ['Word Search', '#37C5D5'],
    ['Guess the Player', '#F06A5F'], ['Number Game', '#F2B632'], ['Odd One Out', '#B79BF6'],
    ['Career Path', '#48D17A'], ['Rank It', '#F778AE'], ['Alma Mater', '#96B93C'],
    ['High Low', '#FF8A3D']
  ];

  var CSS = [
    '.rtgaa{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;',
    '  overflow:auto;padding:max(15px,env(safe-area-inset-top)) 16px 18px;',
    '  -webkit-font-smoothing:antialiased;',
    '  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
    '  background:',
    '    radial-gradient(95% 55% at 50% -10%, rgba(255,138,61,.26), rgba(255,138,61,0) 64%),',
    '    radial-gradient(70% 40% at 50% 108%, rgba(47,107,255,.16), rgba(47,107,255,0) 62%),',
    '    #071426;text-align:center}',
    '.rtgaa[hidden]{display:none}',
    /* IN NORMAL FLOW, NOT ABSOLUTE. Absolutely positioned at top right it landed on top of
       the "Also from RunThe.GG" pill at 390px, because the pill is centred and nearly the
       full width of a phone. The wrap below takes margin:auto, so this simply sits at the
       top of the column and the pill starts underneath it. */
    '.rtgaa .rtgaa-x{align-self:flex-end;flex:0 0 auto;border:1px solid rgba(244,247,251,.2);',
    '  background:rgba(244,247,251,.05);color:#a9b8cb;border-radius:999px;padding:8px 13px;',
    '  font:700 13.5px/1 inherit;cursor:pointer}',
    '.rtgaa .rtgaa-x:hover{border-color:rgba(255,138,61,.5);color:#e8f0f8}',
    '.rtgaa .rtgaa-wrap{margin:auto;width:100%;max-width:440px}',
    '.rtgaa .rtgaa-kick{display:inline-flex;align-items:center;gap:7px;font:800 10.5px/1 inherit;',
    '  letter-spacing:.16em;text-transform:uppercase;color:#FF8A3D;',
    '  border:1px solid rgba(255,138,61,.5);background:rgba(255,138,61,.1);',
    '  border-radius:999px;padding:6px 13px}',
    '.rtgaa .rtgaa-dot{width:6px;height:6px;border-radius:50%;background:#FF8A3D;',
    '  box-shadow:0 0 8px #FF8A3D;animation:rtgaaPulse 1.8s ease-in-out infinite}',
    '@keyframes rtgaaPulse{0%,100%{opacity:1}50%{opacity:.35}}',
    /* Italic Anton, which is the oblique the browser synthesises -- Anton ships no italic.
       That slant is the golf panel's, and it is most of why that one reads as a poster
       rather than as a dialog. */
    '.rtgaa .rtgaa-head{font-family:"Anton",Impact,Haettenschweiler,sans-serif;font-weight:400;',
    '  font-style:italic;',
    '  text-transform:uppercase;letter-spacing:.01em;font-size:clamp(32px,9.5vw,44px);line-height:.96;',
    '  margin:11px 0 7px;background:linear-gradient(180deg,#ffd7a1 0%,#FF8A3D 58%,#FF5A4E 100%);',
    '  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#FF8A3D}',
    '.rtgaa .rtgaa-lede{color:#cfe0f2;font-size:15.5px;line-height:1.5;margin:0 0 13px}',
    '.rtgaa .rtgaa-lede b{color:#fff}',
    '.rtgaa .rtgaa-panel{background:linear-gradient(170deg,#10233A,#0b1a2c);',
    '  border:1px solid rgba(244,247,251,.14);border-radius:16px;padding:15px 14px 13px;',
    '  margin:0 0 12px;box-shadow:0 18px 40px -22px #000}',
    '.rtgaa .rtgaa-grid{display:flex;flex-wrap:wrap;gap:7px;justify-content:center}',
    '.rtgaa .rtgaa-chip{font:800 11.5px/1 inherit;letter-spacing:.02em;color:var(--c);',
    '  border:1px solid color-mix(in srgb,var(--c) 55%,transparent);',
    '  background:color-mix(in srgb,var(--c) 14%,transparent);',
    '  border-radius:999px;padding:7px 11px;white-space:nowrap}',
    '.rtgaa .rtgaa-stats{display:flex;gap:8px;margin:13px 0 0}',
    '.rtgaa .rtgaa-stat{flex:1;background:rgba(244,247,251,.05);border:1px solid rgba(244,247,251,.1);',
    '  border-radius:11px;padding:9px 6px}',
    '.rtgaa .rtgaa-stat b{display:block;font-family:"Anton",Impact,sans-serif;font-weight:400;',
    '  font-size:19px;color:#F4F7FB;line-height:1.05}',
    '.rtgaa .rtgaa-stat span{display:block;font:800 9.5px/1.3 inherit;letter-spacing:.1em;',
    '  text-transform:uppercase;color:#8fa4bb;margin-top:3px}',
    '.rtgaa .rtgaa-fine{color:#a9b8cb;font-size:13.5px;line-height:1.5;margin:0 0 13px}',
    '.rtgaa .rtgaa-btn{display:block;width:100%;max-width:380px;margin:0 auto;border:0;cursor:pointer;',
    '  border-radius:12px;padding:13px 16px;font:800 15px/1.15 inherit;text-decoration:none;',
    '  text-align:center}',
    '.rtgaa .rtgaa-go{background:linear-gradient(160deg,#FFA95C,#FF8A3D 45%,#F0662E);color:#20100a;',
    '  box-shadow:0 8px 26px -8px rgba(255,138,61,.6),inset 0 1px 0 rgba(255,255,255,.45)}',
    '.rtgaa .rtgaa-go .rtgaa-sub{display:block;font:700 11px/1.3 inherit;color:#3a1f0c;margin-top:3px}',
    '.rtgaa .rtgaa-later{background:rgba(244,247,251,.04);color:#a9b8cb;',
    '  border:1px solid rgba(244,247,251,.2);margin-top:9px}',
    '.rtgaa .rtgaa-later:hover{border-color:rgba(255,138,61,.45);color:#cfe0f2}',
    /* The off switch is the one control that must never need looking for. Full-width,
       46px of target, and above the fold on the smallest phone we support. */
    '.rtgaa .rtgaa-chk{display:flex;align-items:center;justify-content:center;gap:10px;',
    '  margin:13px auto 0;min-height:46px;padding:0 16px;max-width:380px;border-radius:12px;',
    '  border:1px solid rgba(244,247,251,.14);background:rgba(244,247,251,.04);',
    '  font:700 13.5px/1 inherit;color:#a9b8cb;cursor:pointer;user-select:none}',
    '.rtgaa .rtgaa-chk:hover{border-color:rgba(255,138,61,.45);color:#cfe0f2}',
    '.rtgaa .rtgaa-chk input{width:19px;height:19px;accent-color:#FF8A3D;flex:0 0 auto;cursor:pointer}',
    '@media(min-width:700px){',
    '  .rtgaa .rtgaa-wrap{max-width:560px}',
    '  .rtgaa .rtgaa-lede{font-size:17.5px}',
    '  .rtgaa .rtgaa-chip{font-size:13px;padding:8px 13px}',
    '  .rtgaa .rtgaa-stat b{font-size:23px}}',
    '@media(prefers-reduced-motion:reduce){.rtgaa .rtgaa-dot{animation:none}}',
    /* SHORT SCREENS GIVE WAY IN ORDER, so the off switch stays on screen.
       That box is the one control that must never need looking for, and on a 667px phone
       the full panel ran ~25px past the fold and put it behind a scroll -- an ad that
       hides its own off switch has earned every bad thing said about it. Everything here
       is decoration compared with that, so it goes first: the stat row, then the
       reassurance line, then the type sizes. The ten names stay to the last, because they
       are the only part doing the actual selling. */
    '@media(max-height:780px){',
    '  .rtgaa{padding-top:14px;padding-bottom:16px}',
    '  .rtgaa .rtgaa-head{font-size:clamp(28px,8vw,34px);margin:10px 0 6px}',
    '  .rtgaa .rtgaa-lede{font-size:14px;margin-bottom:11px}',
    '  .rtgaa .rtgaa-stats{display:none}',
    '  .rtgaa .rtgaa-panel{padding:12px 11px 11px;margin-bottom:11px}',
    '  .rtgaa .rtgaa-fine{font-size:12.5px;margin-bottom:11px}}',
    '@media(max-height:700px){',
    '  .rtgaa .rtgaa-head{font-size:26px;margin:7px 0 5px}',
    '  .rtgaa .rtgaa-lede{font-size:13px;margin-bottom:9px}',
    '  .rtgaa .rtgaa-fine{display:none}',
    '  .rtgaa .rtgaa-chip{font-size:10.5px;padding:5px 8px}',
    '  .rtgaa .rtgaa-grid{gap:5px}',
    '  .rtgaa .rtgaa-btn{padding:11px 14px;font-size:14px}',
    '  .rtgaa .rtgaa-chk{margin-top:11px;min-height:44px}}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('rtgaa-css')) return;
    var s = document.createElement('style');
    s.id = 'rtgaa-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  var node = null;
  function destroy() {
    if (node && node.parentNode) node.parentNode.removeChild(node);
    node = null;
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close('escape'); }

  var from = '';
  function close(how) {
    markSeen();
    track('arcade_ad_dismiss', { how: how, from: from });
    destroy();
  }

  function show(opts) {
    opts = opts || {};
    from = opts.from || '';
    if (node) return true;                       // already up
    injectCss();

    var chips = GAMES.map(function (g) {
      return '<span class="rtgaa-chip" style="--c:' + g[1] + '">' + esc(g[0]) + '</span>';
    }).join('');

    node = document.createElement('div');
    node.className = 'rtgaa';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-label', 'Run The Arcade');
    node.innerHTML =
      '<button class="rtgaa-x" type="button">Close &#10005;</button>' +
      '<div class="rtgaa-wrap">' +
        '<div class="rtgaa-kick"><span class="rtgaa-dot"></span>Also from RunThe.GG</div>' +
        '<h2 class="rtgaa-head">Run The Arcade</h2>' +
        '<p class="rtgaa-lede">Ten quick sports brain-games, <b>new every single day</b>. ' +
          'Two minutes each, one streak to protect.</p>' +
        '<div class="rtgaa-panel">' +
          '<div class="rtgaa-grid">' + chips + '</div>' +
          '<div class="rtgaa-stats">' +
            '<div class="rtgaa-stat"><b>10</b><span>Games</span></div>' +
            '<div class="rtgaa-stat"><b>Daily</b><span>New set</span></div>' +
            '<div class="rtgaa-stat"><b>Free</b><span>To play</span></div>' +
          '</div>' +
        '</div>' +
        '<p class="rtgaa-fine">Same free RunThe.GG account you use here. Your streak carries ' +
          'across the whole site.</p>' +
        '<a class="rtgaa-btn rtgaa-go" href="' + URL_ARCADE + '" target="_blank" rel="noopener">' +
          'Play the Arcade &#8599;' +
          '<span class="rtgaa-sub">Opens in a new tab, nothing here is lost</span></a>' +
        '<button class="rtgaa-btn rtgaa-later" type="button">Maybe later</button>' +
        '<label class="rtgaa-chk"><input type="checkbox"' + (isOff() ? ' checked' : '') + '>' +
          '<span>Don\'t show this again</span></label>' +
      '</div>';
    document.body.appendChild(node);

    var box = node.querySelector('.rtgaa-chk input');
    /* Written the moment it is ticked rather than on the way out, so the promise the
       box makes holds however the panel is dismissed -- including the tab being shut. */
    box.onchange = function () {
      if (box.checked) set('localStorage', OFF, '1'); else del('localStorage', OFF);
      track('arcade_ad_optout', { off: !!box.checked, from: from });
    };
    node.querySelector('.rtgaa-x').onclick = function () { close('x'); };
    node.querySelector('.rtgaa-later').onclick = function () { close('later'); };
    node.querySelector('.rtgaa-go').onclick = function () {
      /* Acting on it counts as seeing it, even inside the survival window below --
         otherwise tapping through instantly would leave the flag unburnt and the panel
         would be waiting again on the next screen. It opens in a NEW TAB, so this page
         (and any round, draft or season in progress on it) is still here afterwards. */
      markSeen();
      track('arcade_ad_click', { from: from });
      destroy();
    };
    /* Backdrop, but only the backdrop: a tap that lands on the panel itself is not a
       dismissal, and on a phone the two are a few pixels apart. */
    node.addEventListener('click', function (e) { if (e.target === node) close('backdrop'); });
    document.addEventListener('keydown', onKey);
    node.querySelector('.rtgaa-x').focus();

    track('arcade_ad_shown', { from: from });
    /* ONLY BURN THE FLAG ONCE IT HAS SURVIVED A BEAT ON SCREEN. Several of these pages
       fire their own popups off a network round trip -- a welcome pack, a login bonus, a
       sign-in sheet -- which can land just after us and replace this. Marking on sight
       would spend the session's one showing on a panel the player never actually saw.
       Stomped, it stays owed and comes back on the next clean screen. */
    setTimeout(function () { if (node) markSeen(); }, 320);
    return true;
  }

  /* ?arcadead=1 or #arcadead forces it past every guard, so the panel can be checked on
     a real device without clearing storage or waiting out the window. */
  function forced() {
    try {
      var u = new URL(location.href);
      if (u.searchParams.get('arcadead') === '1') return true;
      return /[#&?]arcadead(=1)?($|&)/.test(location.hash || '');
    } catch (e) { return false; }
  }

  window.RTG_ARCADE_AD = {
    due: due, show: show, forced: forced, close: close,
    isOff: isOff, markSeen: markSeen, games: GAMES, WINDOW_MS: WINDOW_MS,
    keys: { off: OFF, seen: SEEN, at: AT }
  };
})();
