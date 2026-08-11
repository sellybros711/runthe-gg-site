/* topbanner.js — the shared Run The Arcade top banner (like the football game's).
 *
 * Self-mounting on every arcade page: a sticky bar with the logo (→ the arcade
 * home) top-left, a RunThe.GG link, your tokens (plays left today), and your
 * profile. It owns the account control site-wide, so auth-ui.js skips its own
 * topbar chip when this banner is present (window.RTG_HAS_BANNER).
 *
 * Everything degrades: RTGTokens / RTGAuthUI / RTG_AUTH each optional. The token
 * chip updates live on the 'rtg:tokens' event, on auth/board changes, and when
 * the tab regains focus.
 */
(function () {
  'use strict';
  window.RTG_HAS_BANNER = true;   // tell auth-ui not to also inject a topbar chip

  var PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  var TICKET = '<svg class="tk-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z"/><path d="M15 6v12" stroke-dasharray="2 2"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function T() { return window.RTGTokens || null; }
  function A() { return window.RTG_AUTH || null; }

  function injectStyles() {
    if (document.getElementById('rtb-style')) return;
    var s = document.createElement('style'); s.id = 'rtb-style';
    s.textContent = [
      '.rtg-topbanner{position:sticky;top:0;z-index:9500;display:flex;align-items:center;gap:10px;',
        'padding:8px max(14px,env(safe-area-inset-right)) 8px max(14px,env(safe-area-inset-left));',
        'padding-top:calc(8px + env(safe-area-inset-top,0));',
        'background:color-mix(in srgb, var(--bg,#071426) 86%, transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);',
        'border-bottom:1px solid var(--line2,rgba(244,247,251,.14));}',
      '.rtg-topbanner .rtb-logo{display:inline-flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink,#F4F7FB);min-width:0;}',
      '.rtg-topbanner .rtb-logo img{width:30px;height:30px;border-radius:8px;display:block;flex:0 0 auto;}',
      '.rtg-topbanner .rtb-name{font-family:var(--hero,inherit);font-weight:400;letter-spacing:.02em;text-transform:uppercase;font-size:16px;line-height:1;white-space:nowrap;}',
      '.rtg-topbanner .rtb-right{margin-left:auto;display:flex;align-items:center;gap:8px;min-width:0;}',
      '.rtg-topbanner .rtb-site{font-weight:900;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut,#A9B8CB);border:1px solid var(--line2,rgba(244,247,251,.14));border-radius:999px;padding:6px 10px;text-decoration:none;white-space:nowrap;}',
      '.rtg-topbanner .rtb-site i{font-style:normal;color:var(--coralT,#F06A5F);}',
      '.rtg-topbanner .rtb-site:hover{color:var(--ink,#F4F7FB);}',
      '.rtg-topbanner .rtb-tokens{display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-weight:800;font-size:12px;color:var(--ink,#F4F7FB);background:var(--card2,#162B44);border:1px solid var(--line2,rgba(244,247,251,.14));border-radius:999px;padding:6px 11px;cursor:pointer;white-space:nowrap;line-height:1;}',
      '.rtg-topbanner .rtb-tokens .tk-ic{width:15px;height:15px;flex:0 0 auto;color:var(--coralT,#F06A5F);}',
      '.rtg-topbanner .rtb-tokens:hover{border-color:var(--coralT,#F06A5F);}',
      '.rtg-topbanner .rtb-tokens.unlimited{color:var(--goldT,#F2B632);border-color:color-mix(in srgb,var(--goldT,#F2B632) 55%,transparent);}',
      '.rtg-topbanner .rtb-tokens.unlimited .tk-ic{color:var(--goldT,#F2B632);}',
      '.rtg-topbanner .rtb-prof{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 11px 0 5px;border-radius:999px;border:1px solid var(--line2,rgba(244,247,251,.14));background:var(--card2,#162B44);color:var(--ink,#F4F7FB);cursor:pointer;font-family:inherit;line-height:1;max-width:190px;}',
      '.rtg-topbanner .rtb-prof.out{padding:0 12px;}',
      '.rtg-topbanner .rtb-prof:hover{border-color:var(--coralT,#F06A5F);}',
      '.rtg-topbanner .rtb-prof svg{width:17px;height:17px;flex:0 0 auto;}',
      '.rtg-topbanner .rtb-prof .rtb-plab{font-weight:800;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.rtg-topbanner .rtb-prof .rtb-av{flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--coral,#F06A5F),#F0913C);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;font-family:var(--hero,inherit);}',
      '@media (max-width:520px){.rtg-topbanner .rtb-name{display:none;}}',
      '@media (max-width:440px){.rtg-topbanner .rtb-prof{max-width:130px;}}',
      '@media (max-width:380px){.rtg-topbanner .rtb-site{display:none;}.rtg-topbanner .rtb-prof .rtb-plab{max-width:74px;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  var el = null;
  function build() {
    if (document.querySelector('.rtg-topbanner')) return;
    injectStyles();
    el = document.createElement('header');
    el.className = 'rtg-topbanner';
    el.innerHTML =
      '<a class="rtb-logo" href="/arcade/" aria-label="Run The Arcade home">' +
        '<img src="/arcade/assets/arcade-icon.png?v=2" alt="" width="30" height="30" decoding="async">' +
        '<span class="rtb-name">Run The Arcade</span></a>' +
      '<div class="rtb-right">' +
        '<a class="rtb-site" href="https://runthe.gg">RunThe<i>.GG</i></a>' +
        '<button class="rtb-tokens" id="rtbTokens" type="button" aria-label="Your Arcade Card"></button>' +
        '<button class="rtb-prof out" id="rtbProf" type="button" aria-label="Your profile"></button>' +
      '</div>';
    document.body.insertBefore(el, document.body.firstChild);

    document.getElementById('rtbTokens').addEventListener('click', onTokens);
    document.getElementById('rtbProf').addEventListener('click', onProfile);

    paint();
    // live updates ('rtg:tokens' fires on document from tokens.js on every spend)
    document.addEventListener('rtg:tokens', paint);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) paint(); });
    if (A() && A().onChange) A().onChange(paint);
    if (window.RTG_BOARD && RTG_BOARD.onChange) RTG_BOARD.onChange(paint);
  }

  function paint() {
    if (!el) return;
    var t = T();
    var tk = document.getElementById('rtbTokens');
    if (tk) {
      var unlimited = !!(t && t.hasCard && t.hasCard());
      if (unlimited) { tk.className = 'rtb-tokens unlimited'; tk.innerHTML = TICKET + '<span>Unlimited</span>'; }
      else if (t) {
        var left = t.remaining ? t.remaining() : 0;
        if (left === Infinity) { tk.className = 'rtb-tokens unlimited'; tk.innerHTML = TICKET + '<span>Unlimited</span>'; }
        else { tk.className = 'rtb-tokens'; tk.innerHTML = TICKET + '<span>' + left + ' play' + (left === 1 ? '' : 's') + '</span>'; }
      } else { tk.className = 'rtb-tokens'; tk.innerHTML = TICKET + '<span>Plays</span>'; }
    }
    var pf = document.getElementById('rtbProf');
    if (pf) {
      var st = (A() && A().state) ? A().state() : null;
      if (st && st.signedIn && st.name) {
        pf.className = 'rtb-prof';
        pf.innerHTML = '<span class="rtb-av">' + esc((st.name.charAt(0) || 'P').toUpperCase()) + '</span>' +
          '<span class="rtb-plab">' + esc(st.name) + '</span>';
        pf.setAttribute('aria-label', 'Signed in as ' + st.name);
      } else {
        pf.className = 'rtb-prof out';
        pf.innerHTML = PERSON + '<span class="rtb-plab">Sign in</span>';
        pf.setAttribute('aria-label', 'Sign in');
      }
    }
  }

  function onTokens() {
    // The tokens/Unlimited chip opens the player's Arcade Card (streaks,
    // achievements, next drop, vault, most played). Non-members find the
    // upgrade CTA inside it. Falls back to the paywall if the card is absent.
    if (window.RTGMyCard && RTGMyCard.open) { RTGMyCard.open(); return; }
    if (window.RTGCard && RTGCard.paywall) { RTGCard.paywall({ reason: 'upsell' }); return; }
    onProfile();
  }
  function onProfile() {
    var st = (A() && A().state) ? A().state() : null;
    if (window.RTGAuthUI && RTGAuthUI.open) RTGAuthUI.open(st && st.signedIn ? 'account' : 'signin');
    else if (A() && A().signInGoogle) { /* no modal available */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
