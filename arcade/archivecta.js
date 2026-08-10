/* Run The Arcade - "Play a past day" in the end modal, for Arcade Card members.
 *
 * When you finish today's puzzle and you hold a card, the archive for THIS game
 * is one tap away: a link in the result modal opens the same per-day calendar
 * the archive page uses (RTGCalendar.open), pre-focused on the game you're in,
 * whose day cells drop you straight into /arcade/<game>/?date=YYYY-MM-DD.
 *
 * Shown only to members (RTGTokens.isPro), only when the calendar module is
 * present, and never while already playing an archived day. Injected once per
 * modal open; re-checks entitlement each time (the card flag reconciles a beat
 * after load). No per-game markup - it finds the countdown line (#mCountdown or
 * Match's #resCountdown) and sits just above it.
 *
 * Load after tokens.js + calendar.js. window has RTGArchiveCTA (nothing public,
 * just self-runs). Everything guarded; a missing piece means it quietly no-ops.
 */
(function () {
  'use strict';

  function currentGame() {
    var m = location.pathname.match(/\/arcade\/([a-z]+)\//);
    return m ? m[1] : null;
  }
  function eligible() {
    try {
      if (!(window.RTGCalendar && RTGCalendar.open)) return false;
      if (window.RTGArchive && RTGArchive.active && RTGArchive.active()) return false; // already in the archive
      return !!(window.RTGTokens && RTGTokens.isPro && RTGTokens.isPro());
    } catch (e) { return false; }
  }

  var styled = false;
  function injectCSS() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent =
      '.rtgArchCta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;' +
        'margin:2px 0 10px;padding:12px 14px;border-radius:12px;cursor:pointer;font:800 13.5px var(--f,system-ui,sans-serif);' +
        'color:var(--goldT,#F2B632);background:color-mix(in srgb,var(--gold,#F2B632) 12%,transparent);' +
        'border:1px solid color-mix(in srgb,var(--gold,#F2B632) 45%,transparent);transition:filter .12s;}' +
      '.rtgArchCta:hover{filter:brightness(1.08);}' +
      '.rtgArchCta svg{width:16px;height:16px;flex:0 0 auto;}' +
      '.rtgArchCta .rtgArchTag{font-weight:900;letter-spacing:.02em;}';
    (document.head || document.documentElement).appendChild(s);
  }

  function insert() {
    if (!eligible()) return;
    var game = currentGame(); if (!game) return;
    var cd = document.getElementById('mCountdown') || document.getElementById('resCountdown');
    if (!cd || !cd.parentNode) return;
    if (cd.parentNode.querySelector('.rtgArchCta')) return;   // already there this open
    injectCSS();
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rtgArchCta';
    b.setAttribute('aria-label', 'Play a past day of this game from the archive');
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>' +
      '<span>Play a past day <span class="rtgArchTag">· Card</span></span>';
    b.addEventListener('click', function () { try { RTGCalendar.open(game); } catch (e) {} });
    cd.parentNode.insertBefore(b, cd);
  }

  function watch(el, attr, openWhen) {
    if (!el || !window.MutationObserver) return;
    new MutationObserver(function () { if (openWhen(el)) insert(); })
      .observe(el, { attributes: true, attributeFilter: [attr] });
    if (openWhen(el)) insert();   // already open at wire time
  }

  function init() {
    watch(document.getElementById('scrim'), 'class', function (el) { return !el.classList.contains('hidden'); });
    watch(document.getElementById('resultModal'), 'hidden', function (el) { return !el.hasAttribute('hidden'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
