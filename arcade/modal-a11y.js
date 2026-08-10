/* modal-a11y.js — accessibility for the end-of-game result modals across all
 * nine arcade games. The modals ship as plain <div>s; this adds dialog
 * semantics (role/aria-modal/aria-labelledby), moves focus into the modal on
 * open, traps Tab within it, closes on Escape, and restores focus on close —
 * without touching any game's own logic.
 *
 * Self-mounting and fail-soft: eight games toggle `#scrim.hidden`, Daily Match
 * toggles `#resultModal[hidden]`; both are observed. If neither exists it does
 * nothing. It never blocks a finished puzzle.
 */
(function () {
  'use strict';
  if (!window.MutationObserver) return;

  var active = null;      // the sheet element we've currently decorated
  var lastFocus = null;   // element to restore focus to on close

  function openContainers() {
    var out = [];
    var scrim = document.getElementById('scrim');
    var rm = document.getElementById('resultModal');
    if (scrim && !scrim.classList.contains('hidden')) out.push(scrim);
    if (rm && !rm.hasAttribute('hidden')) out.push(rm);
    return out;
  }
  function sheetIn(c) { return c.querySelector('.sheet') || c.querySelector('.modal') || c; }
  function focusables(el) {
    return [].slice.call(el.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(function (n) { return n.offsetParent !== null; });
  }
  function closeBtn(el) { return el.querySelector('[aria-label="Close"], .x, .close, [data-close], [id$="Close"]'); }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      var b = closeBtn(active);
      if (b) { e.preventDefault(); b.click(); }
      return;
    }
    if (e.key !== 'Tab') return;
    var f = focusables(active); if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (!active.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(sheet) {
    if (active === sheet) return;
    if (active) close();
    active = sheet;
    lastFocus = document.activeElement;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    if (!sheet.hasAttribute('tabindex')) sheet.setAttribute('tabindex', '-1');
    if (!sheet.getAttribute('aria-label') && !sheet.getAttribute('aria-labelledby')) {
      var h = sheet.querySelector('h1,h2,h3,[class*="grade"],[class*="title"],[class*="sub-h"]');
      if (h) { if (!h.id) h.id = 'rtg-dlg-title'; sheet.setAttribute('aria-labelledby', h.id); }
    }
    var f = focusables(sheet);
    try { (f[0] || sheet).focus(); } catch (e) {}
    document.addEventListener('keydown', onKey, true);
  }
  function close() {
    if (!active) return;
    document.removeEventListener('keydown', onKey, true);
    active = null;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    lastFocus = null;
  }

  function sync() {
    var c = openContainers();
    if (c.length) open(sheetIn(c[0]));
    else close();
  }
  function watch() {
    var scrim = document.getElementById('scrim');
    var rm = document.getElementById('resultModal');
    if (scrim) new MutationObserver(sync).observe(scrim, { attributes: true, attributeFilter: ['class'] });
    if (rm) new MutationObserver(sync).observe(rm, { attributes: true, attributeFilter: ['hidden'] });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
