/*
 * rtg-privacy.js : our own "Do Not Sell or Share My Personal Information" link and opt-out, on every
 * page with ads (the owner's pick, 2026-11-26: "go with option 2 for the Do Not Sell link").
 *
 * WHAT IT DOES
 *  - A link labelled exactly "Do Not Sell or Share My Personal Information", next to each page's
 *    Privacy link in its footer (or golf's menu). A page with none gets a small line at its very end.
 *    It never floats or pins, so it never sits over play. It opens /privacy-choices.html.
 *  - The opt-out. A visitor who turns the switch on there, or whose browser sends Global Privacy
 *    Control, is opted out. Then every ad request carries AdSense's restricted data processing
 *    (data-restrict-data-processing="1" on the unit), and Google Analytics gets its ad signals off.
 *
 * WHY THE AD REQUEST IS CHANGED HERE AND NOT IN EACH GAME
 *  AdSense reads the attribute when it fills a unit, and every unit is filled through
 *  adsbygoogle.push(). This file wraps push (both the page's queue and the object Google puts in its
 *  place when adsbygoogle.js loads), so every unit still waiting is marked before Google sees it,
 *  whichever page or game built it. A MutationObserver marks units as they are added too.
 *
 * THE RULES THIS FILE KEEPS (check-adsense holds them)
 *  - It loads WITHOUT async, right before the AdSense tag, so it is in place before any push.
 *  - Ads today are already non-personalised for everyone (Consent Mode denies ad personalisation
 *    worldwide on every page). This file never grants anything. It only ever restricts.
 *  - It never touches Google's own message. Turning that off is the owner's switch in AdSense, after
 *    this link is live.
 *  - The choice is this browser's (localStorage and a first-party cookie, a year).
 */
(function (root) {
  'use strict';
  if (root.RTG_PRIVACY) return;
  var KEY = 'rtg_dns', LABEL = 'Do Not Sell or Share My Personal Information', HREF = '/privacy-choices.html', ID = 'rtg-dns';

  function gpc() { try { return root.navigator.globalPrivacyControl === true; } catch (e) { return false; } }
  function saved() {
    try { if (root.localStorage.getItem(KEY) === '1') return true; } catch (e) {}
    try { return /(?:^|;\s*)rtg_dns=1(?:;|$)/.test(document.cookie); } catch (e) { return false; }
  }
  function optedOut() { return gpc() || saved(); }
  function set(on) {
    try { if (on) root.localStorage.setItem(KEY, '1'); else root.localStorage.removeItem(KEY); } catch (e) {}
    try { document.cookie = KEY + '=' + (on ? '1' : '0') + ';path=/;max-age=' + (on ? 31536000 : 0) + ';SameSite=Lax'; } catch (e) {}
    if (on) restrict();
  }

  /* ---------- the ad request ---------- */
  function stamp(ins) {
    if (ins && ins.getAttribute && !ins.getAttribute('data-restrict-data-processing')) ins.setAttribute('data-restrict-data-processing', '1');
  }
  function stampAll() {
    if (!optedOut()) return;
    try { Array.prototype.forEach.call(document.querySelectorAll('ins.adsbygoogle'), stamp); } catch (e) {}
  }
  function wrap(q) {
    if (!q || typeof q !== 'object' || q.__rtgPrivacy) return q;
    try {
      var push = q.push;
      if (typeof push === 'function') {
        Object.defineProperty(q, 'push', { configurable: true, writable: true, value: function () { stampAll(); return push.apply(q, arguments); } });
      }
      Object.defineProperty(q, '__rtgPrivacy', { value: true });
    } catch (e) {}
    return q;
  }
  var queue = wrap(root.adsbygoogle || []);
  try {
    Object.defineProperty(root, 'adsbygoogle', {
      configurable: true,
      get: function () { return queue; },
      set: function (v) { queue = wrap(v); }
    });
  } catch (e) { root.adsbygoogle = queue; }

  var watching = false;
  function restrict() {
    stampAll();
    /* Analytics: no ad signals for an opted-out visitor (gtag's own queue, so it works before gtag loads) */
    try { root.dataLayer = root.dataLayer || []; root.dataLayer.push(['set', { allow_ad_personalization_signals: false, restricted_data_processing: true }]); } catch (e) {}
    if (watching || typeof MutationObserver !== 'function') return;
    watching = true;
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var add = ms[i].addedNodes;
        for (var j = 0; j < add.length; j++) {
          var n = add[j];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('ins.adsbygoogle')) stamp(n);
          else if (n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll('ins.adsbygoogle'), stamp);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (optedOut()) restrict();

  /* ---------- the link ---------- */
  function link() {
    var a = document.createElement('a');
    a.id = ID;
    a.href = HREF;
    a.textContent = LABEL;
    return a;
  }
  var SPOTS = ['footer', '.site-footer', '.foot', '.footlinks', '.legal', '.mn-links'];
  var PRIV = SPOTS.map(function (q) { return q + ' a[href*="privacy"]:not([href*="privacy-choices"])'; }).join(', ');
  /* Copy the separator the footer already uses: a text dot, a dot in its own span, or none (a footer
     that draws its dots in CSS). A link alone in a list item gets a list item of its own. */
  function place(priv) {
    var a = link();
    var par = priv.parentNode;
    if (par.tagName === 'LI' && par.children.length === 1) {
      var li = document.createElement('li');
      li.appendChild(a);
      par.parentNode.insertBefore(li, par.nextSibling);
      return;
    }
    var sep = null, sib = [priv.previousSibling, priv.nextSibling];
    for (var i = 0; i < 2 && !sep; i++) {
      var n = sib[i];
      if (!n) continue;
      if (n.nodeType === 3 && n.textContent.indexOf('·') !== -1) sep = document.createTextNode(' · ');
      else if (n.nodeType === 1 && n.textContent.trim() === '·') sep = n.cloneNode(true);
    }
    par.insertBefore(a, priv.nextSibling);
    if (sep) par.insertBefore(sep, a);
  }
  function draw() {
    var have = document.getElementById(ID);
    var priv = document.querySelector(PRIV);
    if (have && (!priv || have.parentNode.className !== 'rtg-dns-line')) return;
    if (priv) { if (have) have.parentNode.remove(); place(priv); return; }
    var line = document.createElement('div');
    line.className = 'rtg-dns-line';
    line.style.cssText = 'text-align:center;font-size:12px;line-height:1.4;padding:12px 16px 16px;opacity:.75';
    var a = link();
    a.style.color = 'inherit';
    line.appendChild(a);
    document.body.appendChild(line);
  }
  /* A game that rebuilds its footer on every screen (golf does) drops the link with the old footer,
     so it is put back after each change, one check a frame at most. */
  function start() {
    draw();
    if (typeof MutationObserver !== 'function') return;
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      (root.requestAnimationFrame || setTimeout)(function () { queued = false; draw(); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  root.RTG_PRIVACY = { optedOut: optedOut, gpc: gpc, saved: saved, set: set, LABEL: LABEL };
})(window);
