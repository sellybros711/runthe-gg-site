/*
 * rtg-ads.js : the closeable bottom banner and the desktop side rails, once, for every page.
 *
 *   RTG_ADS.sticky(on, slot, group, o) the bottom banner. on: this screen may carry it. slot: the
 *                                      page's own unit for it. group: the game, so one X closes
 *                                      it across that game's screens for the visit. o.above: a
 *                                      selector for a fixed bar the banner rides on top of (the
 *                                      Arcade's floating nav). A page can also set
 *                                      --rtg-sticky-lift itself (golf does, for its tab bar).
 *   RTG_ADS.rails(on, slots, col, o)   the two 160x600 rails. slots: {left, right}. col: the
 *                                      element (or a function returning it) the game sits in.
 *                                      o.fixed: pin them to the window, for a leaderboard that is a
 *                                      full screen overlay scrolling inside itself (golf's).
 *
 * Each page keeps its unit ids in its own *_SLOT(S) table (check-adsense counts them there) and
 * calls these from its screen switch, so a unit is built on entering a screen and removed on
 * leaving it. This file owns how they look and behave, and nothing about where they go.
 *
 * THE RULES THIS FILE KEEPS (the owner's, 2026-10-28 and 2026-10-29):
 *  - The bottom banner is 300x50 at every width (AdSense keeps a sticky ad to 300px or less). It
 *    has an X. The X removes it (never hides it) and it stays gone for the rest of the visit
 *    (sessionStorage, so a new tab or a new day brings it back).
 *  - One sticky ad on screen at a time: no banner while a pinned draft or season banner is up.
 *  - The page is padded by the banner's rendered height, so nothing a player presses sits under
 *    it. An unfilled banner takes no height and shows no X.
 *  - The rails scroll with the page (or stand beside an overlay that scrolls inside itself). They are built only while each one can sit 150px clear of
 *    the column, and removed when the window gets too narrow. So never on a phone.
 *  - Moving between two screens that both carry an ad keeps the one already up. A unit is never
 *    rebuilt in place, so no screen change reloads an ad that is still showing.
 *  - Every call fails soft. A blocked adsbygoogle.js leaves the page exactly as it was.
 */
(function (root) {
  'use strict';
  if (root.RTG_ADS) return;
  var CLIENT = 'ca-pub-5952069078178257';
  var GAP = 150, RAIL_W = 160;

  var CSS = [
    '.rtg-sticky{position:fixed;left:0;right:0;bottom:var(--rtg-sticky-lift,0px);z-index:60;text-align:center;pointer-events:none}',
    '.rtg-sticky:not(:has(ins[data-ad-status="filled"])){height:0;overflow:hidden}',
    '.rtg-sticky-in{display:inline-block;pointer-events:auto;background:#0b0f17;border-radius:8px 8px 0 0;padding:0 4px 4px;box-shadow:0 -4px 14px rgba(0,0,0,.25);padding-bottom:calc(4px + env(safe-area-inset-bottom,0px))}',
    '.rtg-sticky-top{display:flex;align-items:center;justify-content:space-between;height:22px}',
    '.rtg-sticky-lbl{font:600 9px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8a97a8;padding-left:2px}',
    '.rtg-sticky-x{appearance:none;border:0;background:none;color:#cfd8e3;font:700 16px/1 system-ui,sans-serif;width:28px;height:22px;cursor:pointer;padding:0}',
    '.rtg-sticky-x:hover{color:#fff}',
    '.rtg-sticky ins.adsbygoogle{display:block;width:300px;height:50px}',
    '.rtg-sticky ins.adsbygoogle[data-ad-status="unfilled"]{display:none}',
    'body.rtg-sticky-on{padding-bottom:calc(var(--rtg-body-pb,0px) + var(--sticky-ad-h,0px)) !important}',
    '.rtg-rail{position:absolute;width:160px;z-index:5;text-align:center}',
    '.rtg-rail.rtg-rail-fixed{position:fixed;z-index:65}',
    '.rtg-rail ins.adsbygoogle{display:inline-block;width:160px;height:600px}',
    '.rtg-rail ins.adsbygoogle[data-ad-status="unfilled"]{display:none}',
    '.rtg-rail-lbl{display:none;font:600 9.5px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;opacity:.6;margin:0 0 6px}',
    '.rtg-rail:has(ins[data-ad-status="filled"]) .rtg-rail-lbl{display:block}'
  ].join('\n');

  function style() {
    if (document.getElementById('rtg-ads-css')) return;
    var s = document.createElement('style');
    s.id = 'rtg-ads-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function push() { try { (root.adsbygoogle = root.adsbygoogle || []).push({}); } catch (e) {} }
  function closedKey(group) { return 'rtg_sticky_off:' + (group || 'site'); }
  function closed(group) { try { return root.sessionStorage.getItem(closedKey(group)) === '1'; } catch (e) { return false; } }
  function remember(group) { try { root.sessionStorage.setItem(closedKey(group), '1'); } catch (e) {} }

  /* ---------- the bottom banner ---------- */
  var size = null;
  function dropSticky() {
    var z = document.querySelector('[data-ad-zone="sticky"]');
    if (size) { size.disconnect(); size = null; }
    document.documentElement.style.removeProperty('--sticky-ad-h');
    if (document.body) document.body.classList.remove('rtg-sticky-on');
    if (z) z.remove();
  }
  var above = null;
  function lift() {
    if (!above) return;
    var el = document.querySelector(above), h = 0;
    if (el && el.offsetWidth && getComputedStyle(el).display !== 'none') h = Math.max(0, Math.round(root.innerHeight - el.getBoundingClientRect().top));
    document.documentElement.style.setProperty('--rtg-sticky-lift', h + 'px');
  }
  root.addEventListener('resize', lift);
  function sticky(on, slot, group, o) {
    try {
      if (o && o.above) { above = o.above; lift(); }
      var have = document.querySelector('[data-ad-zone="sticky"]');
      var other = document.querySelector('[data-ad-zone="draft"],[data-ad-zone="season"]');
      if (!on || !slot || closed(group) || other) { dropSticky(); return; }
      if (have) return;
      style();
      var body = document.body;
      if (!document.documentElement.style.getPropertyValue('--rtg-body-pb')) {
        document.documentElement.style.setProperty('--rtg-body-pb', getComputedStyle(body).paddingBottom || '0px');
      }
      var z = document.createElement('div');
      z.className = 'rtg-sticky';
      z.setAttribute('data-ad-zone', 'sticky');
      z.innerHTML = '<div class="rtg-sticky-in"><div class="rtg-sticky-top"><span class="rtg-sticky-lbl">Advertisement</span>' +
        '<button type="button" class="rtg-sticky-x" aria-label="Close ad">&#x2715;</button></div>' +
        '<ins class="adsbygoogle" data-ad-client="' + CLIENT + '" data-ad-slot="' + slot + '"></ins></div>';
      z.querySelector('.rtg-sticky-x').addEventListener('click', function () { remember(group); dropSticky(); });
      body.appendChild(z);
      body.classList.add('rtg-sticky-on');
      if (root.ResizeObserver) {
        size = new ResizeObserver(function () { document.documentElement.style.setProperty('--sticky-ad-h', z.offsetHeight + 'px'); });
        size.observe(z);
      }
      push();
    } catch (e) {}
  }

  /* ---------- the side rails ---------- */
  var last = null;
  function dropRails() { document.querySelectorAll('[data-ad-zone="rail-x"]').forEach(function (r) { r.remove(); }); }
  function rails(on, slots, col, o) {
    o = o || {};
    last = { on: on, slots: slots, col: col, o: o };
    try {
      var el = typeof col === 'function' ? col() : col;
      if (!on || !slots || !el) { dropRails(); return; }
      var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      var left = r.left + parseFloat(cs.paddingLeft || 0), right = r.right - parseFloat(cs.paddingRight || 0);
      if (!r.width || left - GAP - RAIL_W < 0 || right + GAP + RAIL_W > document.documentElement.clientWidth) { dropRails(); return; }
      var dx = o.fixed ? 0 : root.scrollX;
      var top = (o.fixed ? Math.max(20, Math.round(r.top + parseFloat(cs.paddingTop || 0) + 40)) : Math.round(r.top + root.scrollY + 40)) + 'px';
      var at = { left: Math.round(left - GAP - RAIL_W + dx) + 'px', right: Math.round(right + GAP + dx) + 'px' };
      var have = document.querySelectorAll('[data-ad-zone="rail-x"]');
      if (have.length) { have.forEach(function (x) { x.style.left = at[x.getAttribute('data-side')]; x.style.top = top; }); return; }
      style();
      ['left', 'right'].forEach(function (side) {
        if (!slots[side]) return;
        var z = document.createElement('div');
        z.className = 'rtg-rail' + (o.fixed ? ' rtg-rail-fixed' : '');
        z.setAttribute('data-ad-zone', 'rail-x');
        z.setAttribute('data-side', side);
        z.style.left = at[side];
        z.style.top = top;
        z.innerHTML = '<span class="rtg-rail-lbl">Advertisement</span><ins class="adsbygoogle" data-ad-client="' + CLIENT + '" data-ad-slot="' + slots[side] + '"></ins>';
        document.body.appendChild(z);
        push();
      });
    } catch (e) {}
  }
  root.addEventListener('resize', function () { if (last) rails(last.on, last.slots, last.col, last.o); });

  root.RTG_ADS = { sticky: sticky, rails: rails, dropSticky: dropSticky, dropRails: dropRails };
})(window);
