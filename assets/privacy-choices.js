/*
 * privacy-choices.js : our own "Do Not Sell or Share" link, in place of Google's floating bar.
 *
 * Google's CMP (loaded by adsbygoogle.js) shows US visitors a bar pinned to the bottom of the
 * screen. The owner asked for it gone (2026-10-28). Google's Privacy & Messaging API allows that
 * only if the site shows its own link, so this file does both, and they never come apart:
 *
 *   googlefc.usstatesoptout.overrideDnsLink = true      Google draws no bar.
 *   a footer link that calls openConfirmationDialog     the visitor can still opt out.
 *
 * THE RULES THIS FILE KEEPS:
 *  - It loads WITHOUT async, right before the AdSense tag. The flag must be set before the CMP
 *    reads it, and an async script could run after. check-adsense holds the order.
 *  - The link goes next to the page's Privacy link (its footer, or golf's menu), when there is
 *    one. Otherwise it is a small line at the very end of the page. It never floats or pins.
 *  - It is drawn only once Google's data is ready, and left out only when Google says no US state
 *    law applies to this visitor. An unknown answer shows the link: when in doubt, offer it.
 *  - With an ad blocker the CMP never loads, so the link never appears. Then no ad ran and nothing
 *    was sold, and a link that could not open the dialog would be worse than none.
 *  - The AdSense message itself must stay as it is. This file only moves the link.
 */
(function (root) {
  'use strict';
  var fc = root.googlefc = root.googlefc || {};
  fc.usstatesoptout = fc.usstatesoptout || {};
  fc.usstatesoptout.overrideDnsLink = true;
  fc.callbackQueue = fc.callbackQueue || [];

  var LABEL = 'Do Not Sell or Share My Personal Information';
  var ID = 'rtg-dns';

  function applies() {
    var o = root.googlefc && root.googlefc.usstatesoptout;
    if (!o || typeof o.getInitialUsStatesOptOutStatus !== 'function') return true;
    var e = o.InitialUsStatesOptOutStatusEnum;
    try {
      var s = o.getInitialUsStatesOptOutStatus();
      return !(e && 'DOES_NOT_APPLY' in e && s === e.DOES_NOT_APPLY);
    } catch (err) { return true; }
  }

  function open(ev) {
    ev.preventDefault();
    var o = root.googlefc && root.googlefc.usstatesoptout;
    if (o && typeof o.openConfirmationDialog === 'function') {
      try { o.openConfirmationDialog(function () {}); } catch (err) { /* the dialog is Google's */ }
    }
  }

  function link() {
    var a = document.createElement('a');
    a.id = ID;
    a.href = '#';
    a.textContent = LABEL;
    a.addEventListener('click', open);
    return a;
  }

  var SPOTS = ['footer', '.site-footer', '.foot', '.footlinks', '.legal', '.mn-links'];
  var PRIV = SPOTS.map(function (q) { return q + ' a[href*="privacy"]'; }).join(', ');

  /* Copy the separator the footer already uses: a text dot, a dot in its own span, or none at
     all (a footer that draws its dots in CSS, like golf's). A link alone in a list item gets a
     list item of its own. */
  function place(priv) {
    var a = link();
    var par = priv.parentNode;
    if (par.tagName === 'LI' && par.children.length === 1) {
      var li = document.createElement('li');
      li.appendChild(a);
      par.parentNode.insertBefore(li, par.nextSibling);
      return;
    }
    var sep = null;
    var sib = [priv.previousSibling, priv.nextSibling];
    for (var i = 0; i < 2 && !sep; i++) {
      var n = sib[i];
      if (!n) continue;
      if (n.nodeType === 3 && n.textContent.indexOf('·') !== -1) sep = document.createTextNode(' · ');
      else if (n.nodeType === 1 && n.textContent.trim() === '·') sep = n.cloneNode(true);
    }
    par.insertBefore(a, priv.nextSibling);
    if (sep) par.insertBefore(sep, a);
  }

  var on = false;
  function draw() {
    on = true;
    if (!applies()) return;
    var have = document.getElementById(ID);
    var priv = document.querySelector(PRIV);
    if (have && (!priv || have.parentNode.className !== 'rtg-dns-line')) return;
    if (priv) {
      if (have) have.parentNode.remove();
      place(priv);
      return;
    }
    var line = document.createElement('div');
    line.className = 'rtg-dns-line';
    line.style.cssText = 'text-align:center;font-size:12px;line-height:1.4;padding:12px 16px 16px;opacity:.75';
    var a = link();
    a.style.color = 'inherit';
    line.appendChild(a);
    document.body.appendChild(line);
  }

  /* A game that rebuilds its footer on every screen (golf does) would drop the link with the old
     footer, so it is put back after each change. One check a frame at most. */
  var queued = false;
  function watch() {
    if (typeof MutationObserver !== 'function') return;
    new MutationObserver(function () {
      if (!on || queued) return;
      queued = true;
      (root.requestAnimationFrame || setTimeout)(function () { queued = false; draw(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  function ready() {
    if (on) return;
    var go = function () { draw(); watch(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }

  fc.callbackQueue.push({ INITIAL_US_STATES_OPT_OUT_DATA_READY: ready });

  /* A second way in, so the link can never go missing while the bar is suppressed: if the queue
     key above is ever renamed, the link still appears once Google's dialog can be opened. */
  root.addEventListener('load', function () {
    var tries = 0;
    var t = setInterval(function () {
      var o = root.googlefc && root.googlefc.usstatesoptout;
      if (o && typeof o.openConfirmationDialog === 'function') { clearInterval(t); ready(); }
      else if (++tries >= 20) clearInterval(t);
    }, 500);
  });
})(window);
