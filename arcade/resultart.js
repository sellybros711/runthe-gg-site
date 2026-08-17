/* resultart.js - the share card, shown to the player who earned it.
 *
 * Every game already draws a bespoke 1080x1350 poster of your run (share.js:
 * a rising staircase for the Number Game, a path for Career Path, a rank
 * ladder, a crossword grid, a solve timeline for Common Ground). Until now it
 * was drawn only if you pressed Share, so the person who actually did the thing
 * never saw it. The end screen showed them a bare number on a stack of buttons.
 *
 * This puts the card at the top of the result modal. It costs one drawing that
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
      /* The card leads the modal. Capped by height, not width, so a tall poster
         can never push the buttons under the fold on a short phone - the whole
         point is that the next thing to do stays visible. */
      '.rtgart{margin:0 0 14px;position:relative;border-radius:14px;overflow:hidden;',
      '  background:var(--card2,#162B44);border:1px solid var(--line2,rgba(255,255,255,.14));',
      '  opacity:0;transform:translateY(6px);transition:opacity .32s ease,transform .32s ease;}',
      '.rtgart.on{opacity:1;transform:none;}',
      '.rtgart img{display:block;width:100%;height:auto;max-height:min(38vh,280px);object-fit:contain;background:#071426;}',
      /* a quiet strip under the picture: what it is, and the one action it wants */
      '.rtgart-bar{display:flex;align-items:center;gap:9px;padding:9px 11px;',
      '  border-top:1px solid var(--line,rgba(255,255,255,.08));}',
      '.rtgart-bar .l{flex:1;min-width:0;font-size:10.5px;font-weight:900;letter-spacing:.09em;',
      '  text-transform:uppercase;color:var(--mut,#8aa0b8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.rtgart-bar button{appearance:none;border:1px solid var(--line2,rgba(255,255,255,.16));',
      '  background:transparent;color:var(--ink,#F4F7FB);font:900 11px var(--f,system-ui);',
      '  letter-spacing:.06em;text-transform:uppercase;border-radius:999px;padding:7px 12px;cursor:pointer;flex:0 0 auto;}',
      '.rtgart-bar button:hover{border-color:var(--brandT,#FF8A3D);color:var(--brandT,#FF8A3D);}',
      /* while the poster renders, hold its space so the modal does not jump */
      '.rtgart.wait{min-height:140px;}'
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
      box.innerHTML = '<div class="rtgart-bar"><span class="l">Your card</span></div>';
      // Above everything the game wrote, including its own headline.
      sheet.insertBefore(box, sheet.firstChild);
    }
    busy = true;
    RTGShare.preview(sp).then(function (url) {
      busy = false;
      if (!url) { box.remove(); return; }
      lastKey = sig;
      box.classList.remove('wait');
      box.innerHTML =
        '<img alt="Your Run The Arcade card for today" src="' + url + '">' +
        '<div class="rtgart-bar"><span class="l">Your card</span>' +
        '<button type="button" data-rtgart-share>Share it</button></div>';
      var b = box.querySelector('[data-rtgart-share]');
      if (b) b.onclick = function () {
        // Hand off to the game's own Share button when it has one, so the
        // challenge loop and its milestone tracking still see the press.
        var s = sheet.querySelector('#mShare, #resShare');
        if (s) { s.click(); return; }
        try { RTGShare.send(spec() || sp); } catch (e) {}
      };
      requestAnimationFrame(function () { box.classList.add('on'); });
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
