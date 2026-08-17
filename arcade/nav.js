/* nav.js - the arcade's bottom tab bar.
 *
 * WHAT IT REPLACED. A twelve-link strip: Home, all ten games, Archive. On the
 * hub that was the page repeated back at itself, since the hub's whole body is
 * those ten tiles, and it was a horizontally scrolling row of 9.5px labels so
 * every entry was both redundant and hard to hit.
 *
 * WHAT BELONGS HERE INSTEAD. The top banner is position:sticky and never leaves
 * the screen, and it already carries Home (the logo), My Card (the plays chip)
 * and Account (the profile chip). Anything from that list put down here is the
 * same redundancy in a new place. So this bar holds the things that have no
 * persistent home anywhere:
 *
 *   Today    the hub. A tab bar without a home tab is disorienting, and this is
 *            the thumb-reachable one on a long page. Badged with how many of
 *            today's puzzles you have left, which is the number that decides
 *            whether you open the app again this evening.
 *   Vault    past days. Currently reachable only from one row on the hub and a
 *            button inside My Card. It is also the thing the Arcade Card sells,
 *            so a padlock here is an honest advert rather than an interruption:
 *            non-members get the offer instead of a wall.
 *   Streak   your current run, as a number you can see without opening
 *            anything. Not a duplicate of the plays chip above, which counts
 *            down what is left today; this counts up what you would lose.
 *            Opens My Card.
 *   RunThe   the rest of the site. The top banner's link to it is display:none
 *            under 440px, so on a phone this is otherwise footer-only.
 *
 * Four destinations, each one a place, none of them a game. Live state comes
 * from RTGTokens and localStorage, the same reads the hub and My Card use, so
 * there are no network calls and nothing to wait for.
 *
 * Self-mounting, like challenge.js and funnel.js. Include it and it appears;
 * it reserves its own space at the foot of the page. window.RTGNav.
 */
(function () {
  'use strict';

  var LS = window.localStorage;
  function g(k, d) { try { return LS.getItem(k) || d; } catch (e) { return d; } }
  function T() { return window.RTGTokens || null; }

  var ICON = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/></svg>',
    vault: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4" stroke-linecap="round"/></svg>',
    lock:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 10V7a6 6 0 0 1 12 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h8V7a4 4 0 0 0-8 0z"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 1.6s.8 2.3.8 4.2c0 1.8-1.2 3.3-3 3.3S8.2 7.6 8.2 5.8c0-.4 0-.8.1-1.2C5.6 6.5 4 9.4 4 12.5 4 17.2 7.8 21 12.5 21S21 17.2 21 12.5c0-4.8-3.6-8.8-7.5-10.9z"/></svg>',
    site:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18"/></svg>'
  };

  /* How many of today's puzzles are still waiting. Counts only what this player
     can actually open, so a free account sees "3 left" out of its four rather
     than a 10 it has no way to reach. */
  function leftToday() {
    var t = T(); if (!t || !t.GAMES) return null;
    if (!(t.signedIn && t.signedIn())) return null;      // signed out: nothing to count
    var n = 0;
    for (var i = 0; i < t.GAMES.length; i++) {
      var k = t.GAMES[i];
      try {
        if (t.unlocked && !t.unlocked(k)) continue;
        if (t.playsOf && t.playsOf(k) > 0) continue;
      } catch (e) { continue; }
      n++;
    }
    return n;
  }

  /* The same current-streak reduction My Card performs, kept in step with it on
     purpose: two different numbers under the same word would be worse than no
     number at all. */
  function streak() {
    function j(k) { try { return JSON.parse(g(k, '{}')) || {}; } catch (e) { return {}; } }
    var cur = parseInt(g('grid_match_streak', '0'), 10) || 0;
    var cw = j('rtg:cw:v1'), gs = j('rtg:guess:v1'), ts = j('rtg:table:v1'), os = j('rtg:oddone:v1'),
        rs = j('rtg:career:v1'), ks = j('rtg:rankit:v2'), as = j('rtg:almamater:v1');
    return Math.max(cur, cw.streak | 0, gs.streak | 0, ts.streak | 0, os.streak | 0,
                    rs.streak | 0, ks.streak | 0, as.streak | 0);
  }

  function hasCard() { try { var t = T(); return !!(t && t.isPro && t.isPro()); } catch (e) { return false; } }

  function styles() {
    if (document.getElementById('rtgnav-css')) return;
    var s = document.createElement('style'); s.id = 'rtgnav-css';
    s.textContent = [
      '.rtgnav{position:fixed;left:0;right:0;bottom:0;z-index:9400;display:flex;align-items:stretch;',
      '  padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px));',
      '  background:color-mix(in srgb, var(--bg,#0B1826) 94%, transparent);backdrop-filter:blur(12px);',
      '  border-top:1px solid var(--line,rgba(255,255,255,.09));}',
      /* Four equal targets. No horizontal scroll: if it does not fit, it is the
         wrong number of tabs, not a scrolling problem. */
      '.rtgnav a,.rtgnav button{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;',
      '  justify-content:center;gap:4px;padding:6px 2px;border:0;background:none;cursor:pointer;',
      '  color:var(--dim,#7C8DA3);font:900 9.5px/1 var(--f,system-ui,sans-serif);letter-spacing:.06em;',
      '  text-transform:uppercase;text-decoration:none;-webkit-tap-highlight-color:transparent;}',
      '.rtgnav .ic{position:relative;display:block;width:23px;height:23px;}',
      '.rtgnav .ic svg{width:100%;height:100%;display:block;}',
      '.rtgnav a.on,.rtgnav button.on{color:var(--coralT,#F06A5F);}',
      '.rtgnav a:active,.rtgnav button:active{transform:translateY(1px);}',
      '.rtgnav .lab{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      /* the count of puzzles still open today */
      '.rtgnav .badge{position:absolute;top:-5px;right:-8px;min-width:16px;height:16px;padding:0 4px;',
      '  box-sizing:border-box;border-radius:999px;background:var(--brand,#FF8A3D);color:var(--onAccent,#160B02);',
      '  font:900 10px/16px var(--f,system-ui,sans-serif);text-align:center;letter-spacing:0;}',
      '.rtgnav .badge.done{background:var(--greenT,#48D17A);}',
      /* Gold rather than orange: this one counts up what you have built, the
         other counts down what is left today. Same shape so a three-digit
         streak is as legible as a one-digit one, which is not true of a number
         drawn inside a 23px flame. */
      /* Literal gold, not var(--goldT): that token darkens in the light theme so
         body text stays readable on a white page, which is the right call for
         text and the wrong one for a filled pill carrying dark text on top. */
      '.rtgnav .badge.run{background:#F2B632;color:#160B02;}',
      /* the padlock corner on the Vault tab */
      '.rtgnav .pin{position:absolute;bottom:-3px;right:-6px;width:12px;height:12px;color:var(--mut,#A9B8CB);}',
      '.rtgnav .pin svg{width:100%;height:100%;}',
      // no fire at zero, the same rule the streak flame follows everywhere else
      '.rtgnav .stk{display:block;width:100%;height:100%;color:var(--goldT,#F2B632);}',
      '.rtgnav .stk.cold{color:var(--dim,#7C8DA3);opacity:.75;}',
      '@media (max-width:340px){.rtgnav a,.rtgnav button{font-size:8.5px;} .rtgnav .ic{width:21px;height:21px;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  var el = null;

  function tab(kind, href, label, inner, on) {
    return '<' + (href ? 'a href="' + href + '"' : 'button type="button"') +
      ' data-nav="' + kind + '"' + (on ? ' class="on" aria-current="page"' : '') + '>' +
      '<span class="ic">' + inner + '</span><span class="lab">' + label + '</span>' +
      '</' + (href ? 'a' : 'button') + '>';
  }

  function here() {
    var p = '';
    try { p = location.pathname || ''; } catch (e) {}
    if (/\/arcade\/archive\//.test(p)) return 'vault';
    if (/\/arcade\/?$/.test(p) || /\/arcade\/index\.html$/.test(p)) return 'today';
    return '';
  }

  function paint() {
    if (!el) return;
    var at = here();

    var n = leftToday();
    var badge = '';
    if (n != null) {
      badge = n > 0
        ? '<span class="badge">' + n + '</span>'
        : '<span class="badge done" aria-hidden="true">&#10003;</span>';
    }
    var left = n == null ? '' : (n > 0 ? (', ' + n + ' still to play today') : ', all played today');

    var card = hasCard();
    var vault = ICON.vault + (card ? '' : '<span class="pin">' + ICON.lock + '</span>');

    var s = streak();
    var stk = '<span class="stk' + (s > 0 ? '' : ' cold') + '">' + ICON.flame + '</span>' +
              (s > 0 ? '<span class="badge run">' + (s > 999 ? '999' : s) + '</span>' : '');

    el.innerHTML =
      tab('today', '/arcade/', 'Today', ICON.today + badge, at === 'today') +
      tab('vault', card ? '/arcade/archive/' : '', 'Vault', vault, at === 'vault') +
      tab('streak', '', 'Streak', stk, false) +
      tab('site', '/', 'RunThe.GG', ICON.site, false);

    var a = el.querySelector('[data-nav="today"]');
    if (a) a.setAttribute('aria-label', 'Today’s puzzles' + left);
    var v = el.querySelector('[data-nav="vault"]');
    if (v) v.setAttribute('aria-label', card ? 'The Vault: past days' : 'The Vault: past days, Arcade Card required');
    var k = el.querySelector('[data-nav="streak"]');
    if (k) k.setAttribute('aria-label', 'Your streak: ' + s + (s === 1 ? ' day' : ' days') + '. Opens your Arcade Card.');
  }

  function onClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-nav]') : null;
    if (!b) return;
    var kind = b.getAttribute('data-nav');
    if (kind === 'streak') {
      e.preventDefault();
      if (window.RTGMyCard && RTGMyCard.open) RTGMyCard.open();
      return;
    }
    // A locked Vault renders as a button, not a link, so the tap lands on the
    // offer rather than on a page that only says no.
    if (kind === 'vault' && b.tagName === 'BUTTON') {
      e.preventDefault();
      if (window.RTGCard && RTGCard.paywall) RTGCard.paywall({ reason: 'archive' });
    }
  }

  /* Reserve the bar's height at the foot of the page. Games and the hub set
     their own bottom padding for their own furniture, so add to it rather than
     replacing it, and do it on <body> so nothing inside has to know we exist. */
  function reserve() {
    try {
      var h = (el && el.offsetHeight) || 58;
      document.body.style.paddingBottom = 'calc(' + h + 'px + var(--rtgnav-extra, 0px))';
    } catch (e) {}
  }

  function mount() {
    if (el) return;
    styles();
    el = document.createElement('nav');
    el.className = 'rtgnav';
    el.setAttribute('aria-label', 'Arcade');
    document.body.appendChild(el);
    paint();
    reserve();
    el.addEventListener('click', onClick);
    // Plays, entitlement and streaks all move while the page is open.
    document.addEventListener('rtg:tokens', paint);
    document.addEventListener('rtg:auth', paint);
    try { if (window.RTG_BOARD && RTG_BOARD.onChange) RTG_BOARD.onChange(paint); } catch (e) {}
    window.addEventListener('resize', reserve);
    // localStorage written by another tab (a game finished in a second tab)
    window.addEventListener('storage', paint);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.RTGNav = { refresh: paint };
})();
