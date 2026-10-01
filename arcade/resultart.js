/* resultart.js - the share card, shown to the player who earned it.
 *
 * Every game already draws a bespoke 1080x1350 poster of your run (share.js:
 * a rising staircase for the Number Game, a path for Career Path, a rank
 * ladder, a crossword grid, a solve timeline for Common Ground). Until now it
 * was drawn only if you pressed Share, so the person who actually did the thing
 * never saw it. The end screen showed them a bare number on a stack of buttons.
 *
 * This puts the card in the result modal, under the score. It costs one drawing that
 * was already being made, and it does three jobs at once: the result becomes
 * worth looking at, the board you just played is visible again (the art IS the
 * board), and Share stops being a leap of faith because you can see exactly
 * what you would be sending.
 *
 * Integration is one line per game: set window.RTG_CARD_SPEC to a function
 * returning the same spec the game already hands RTGShare.send(). Anything
 * missing and this module does nothing at all.
 *
 * Self-mounting, like challenge.js and funnel.js, and it uses their modal
 * resolver: "#scrim > .sheet" in seven games, "#resultModal" in Common Ground,
 * "#scrim > .modal" in the Crossword.
 */
(function () {
  'use strict';

  function gameKey() { var m = (location.pathname || '').match(/\/arcade\/([a-z]+)\//); return m ? m[1] : null; }
  var GAME = gameKey();
  if (!GAME) return;

  function findSheet() {
    return document.querySelector('#scrim .sheet') ||
           document.querySelector('#scrim .modal') ||
           document.querySelector('#resultModal .sheet') ||
           document.querySelector('#resultModal .modal');
  }

  var styled = false;
  function injectCSS() {
    if (styled) return; styled = true;
    var s = document.createElement('style'); s.id = 'rtgart-css';
    s.textContent = [
      /* The card sits UNDER the score, as a tile: a thumbnail and one button.
         It used to lead the modal at full width, which put the same number on
         screen twice (once on the poster, once in the headline under it) and
         pushed the headline half a screen down. The score is the headline;
         the card is the thing you send. Tap the thumbnail to see it big. */
      '.rtgart{margin:14px 0 4px;position:relative;border-radius:18px;overflow:hidden;text-align:left;',
      '  display:flex;align-items:center;gap:14px;padding:10px 12px 10px 10px;',
      '  background:linear-gradient(135deg,color-mix(in srgb,var(--gac,#F2B632) 14%,var(--card2,#162B44)),var(--card2,#162B44) 70%);',
      '  border:1px solid color-mix(in srgb,var(--gac,#F2B632) 30%,var(--line2,rgba(255,255,255,.14)));',
      '  opacity:0;transform:translateY(6px);transition:opacity .32s ease,transform .32s ease;}',
      '.rtgart.on{opacity:1;transform:none;}',
      '.rtgart-thumb{appearance:none;border:0;padding:0;margin:0;cursor:zoom-in;flex:0 0 76px;width:76px;',
      '  aspect-ratio:4/5;border-radius:10px;overflow:hidden;background:#071426;',
      '  box-shadow:0 6px 16px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.08);transform:rotate(-3deg);',
      '  transition:transform .2s ease;}',
      '.rtgart-thumb:hover{transform:rotate(0) scale(1.03);}',
      '.rtgart-thumb img{display:block;width:100%;height:100%;object-fit:cover;}',
      '.rtgart-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;}',
      '.rtgart-body .l{font-size:10.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;',
      '  color:var(--mut,#8aa0b8);}',
      '.rtgart-body .t{font:400 19px/1.05 Anton,var(--f,system-ui);letter-spacing:.01em;color:var(--ink,#F4F7FB);',
      '  text-transform:uppercase;}',
      /* Secondary on purpose: NEXT is the button this screen is for, and two
         solid buttons in one colour a few lines apart read as one choice. */
      '.rtgart-body button{appearance:none;align-self:flex-start;cursor:pointer;',
      '  border:1.5px solid color-mix(in srgb,var(--gac,#F2B632) 70%,transparent);',
      '  background:color-mix(in srgb,var(--gac,#F2B632) 16%,transparent);color:var(--ink,#F4F7FB);',
      '  font:900 12.5px var(--f,system-ui);letter-spacing:.07em;text-transform:uppercase;',
      '  border-radius:12px;padding:9px 16px;display:inline-flex;align-items:center;gap:7px;}',
      '.rtgart-body button::before{content:"";width:14px;height:14px;flex:0 0 14px;background:currentColor;',
      '  -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272.6%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6%27/%3E%3C/svg%3E") center/contain no-repeat;',
      '  mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272.6%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6%27/%3E%3C/svg%3E") center/contain no-repeat;}',
      '.rtgart-body button:hover{background:color-mix(in srgb,var(--gac,#F2B632) 28%,transparent);}',
      /* opened: the poster at full width, the tile folded under it */
      '.rtgart.big{flex-direction:column;align-items:stretch;padding:10px;}',
      '.rtgart.big .rtgart-thumb{flex:none;width:100%;aspect-ratio:auto;transform:none;cursor:zoom-out;}',
      '.rtgart.big .rtgart-thumb img{height:auto;max-height:min(56vh,440px);object-fit:contain;}',
      '.rtgart.big .rtgart-body{flex-direction:row;align-items:center;justify-content:space-between;}',
      '.rtgart.big .rtgart-body .t{display:none;}',
      /* while the poster renders, hold its space so the modal does not jump */
      '.rtgart.wait{min-height:116px;}',
      '@media (prefers-reduced-motion:reduce){.rtgart,.rtgart-thumb{transition:none;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function spec() {
    try {
      if (typeof window.RTG_CARD_SPEC === 'function') return window.RTG_CARD_SPEC();
    } catch (e) {}
    return null;
  }

  var busy = false, lastKey = '';
  function decorate() {
    var sheet = findSheet(); if (!sheet) return;
    if (!(window.RTGShare && RTGShare.preview)) return;
    var sp = spec(); if (!sp || !sp.key) return;

    // Redraw only when the result itself changed: the modal re-opens on every
    // replay, and a canvas render per open would be visible work for nothing.
    var sig = [sp.key, sp.date, sp.stat, sp.statInt, sp.grid].join('|');
    var have = sheet.querySelector('.rtgart');
    if (have && lastKey === sig) return;
    if (busy) return;

    injectCSS();
    var box = have;
    if (!box) {
      box = document.createElement('div');
      box.className = 'rtgart wait';
      // Under the score and the chips, never above the headline. Every game
      // has an .a-runline (result.js paints its chips just before it), so the
      // card lands after the number it is a picture of.
      var anchor = sheet.querySelector('.a-runline');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
      else sheet.insertBefore(box, sheet.firstChild);
    }
    busy = true;
    RTGShare.preview(sp).then(function (url) {
      busy = false;
      if (!url) { box.remove(); return; }
      lastKey = sig;
      box.classList.remove('wait');
      box.innerHTML =
        '<button type="button" class="rtgart-thumb" aria-label="See your card big" aria-expanded="false">' +
        '<img alt="Your Run The Arcade card for today" src="' + url + '"></button>' +
        '<div class="rtgart-body"><span class="l">Your card</span>' +
        '<span class="t">Think they can beat it?</span>' +
        '<button type="button" data-rtgart-share>Share it</button></div>';
      var th = box.querySelector('.rtgart-thumb');
      if (th) th.onclick = function () {
        var on = box.classList.toggle('big');
        th.setAttribute('aria-expanded', on ? 'true' : 'false');
        th.setAttribute('aria-label', on ? 'Shrink your card' : 'See your card big');
      };
      var b = box.querySelector('[data-rtgart-share]');
      if (b) b.onclick = function () {
        // Hand off to the game's own Share button when it has one, so the
        // challenge loop and its milestone tracking still see the press.
        var s = sheet.querySelector('#mShare, #resShare');
        if (s) { s.click(); return; }
        try { RTGShare.send(spec() || sp); } catch (e) {}
      };
      requestAnimationFrame(function () { box.classList.add('on'); });
      /* The loose Share button underneath is now the same action twice. Hide
         it rather than remove it: the card's button clicks it, so its handler
         and the challenge loop's watch on it both have to stay. funnel.js
         cannot do this itself - it ranks the modal the moment it opens, and
         the card arrives a beat later, once the canvas has drawn. */
      var dup = sheet.querySelector('#mShare, #resShare');
      if (dup) dup.style.display = 'none';
      // The card is what the hub reads back later, so bank it here rather than
      // only when somebody shares.
      try { RTGShare.remember(sp); } catch (e) {}
    }, function () { busy = false; if (box) box.remove(); });
  }

  function watch() {
    if (!window.MutationObserver) return;
    var scrim = document.getElementById('scrim');
    var rm = document.getElementById('resultModal');
    var check = function () {
      if (scrim && !scrim.classList.contains('hidden') && !scrim.hasAttribute('hidden')) decorate();
      if (rm && !rm.hasAttribute('hidden')) decorate();
    };
    if (scrim) new MutationObserver(check).observe(scrim, { attributes: true, attributeFilter: ['class', 'hidden'] });
    if (rm) new MutationObserver(check).observe(rm, { attributes: true, attributeFilter: ['hidden'] });
    check();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
