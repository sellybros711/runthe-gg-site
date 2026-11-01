/*
 * rtg-ads.js : the closeable bottom banner and the desktop side rails, once, for every page.
 *
 *   RTG_ADS.sticky(on, slot, group, o) the bottom banner. on: this screen may carry it. slot: the
 *                                      page's own unit for it. group: the game, so one X closes
 *                                      it across that game's screens for the visit. o.above: a
 *                                      selector for a fixed bar the banner rides on top of (the
 *                                      Arcade's floating nav). A page can also set
 *                                      --rtg-sticky-lift itself (golf does, for its tab bar).
 *                                      o.z: its layer, when it must sit over a full screen
 *                                      overlay (golf's leaderboards, which are 40).
 *   RTG_ADS.clear(nodes)               move rails down until each is 150px clear of every control
 *                                      around it (a page that builds its own rails calls it too).
 *   RTG_ADS.rails(on, slots, col, o)   the two 160x600 rails. slots: {left, right}. col: the
 *                                      element (or a function returning it) the game sits in.
 *                                      o.fixed: pin them to the window, for a leaderboard that is a
 *                                      full screen overlay scrolling inside itself (golf's).
 *
 * A page that lays itself out around the banner listens for the 'rtg-sticky' event on window: it
 * fires whenever the banner fills, changes height or goes (the X, or a screen without one).
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
 *  - It sits on layer 35: over the page and its fixed bars, under every sheet and modal (40 and
 *    up), so a sheet opened on a home screen is never covered by it.
 *  - The page is padded by the banner's rendered height, so nothing a player presses sits under
 *    it. An unfilled banner takes no height and shows no X.
 *  - A rail stands 150px clear of every control, the site bar's logo and buttons included: it starts
 *    40px below the column's top and moves down past anything closer (the Arcade Agent's catch).
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
    /* The strip is full width and opaque (the owner, 2026-10-30: "cover the space to the left and right
     * of the sticky ad so you can't see behind it"). It takes taps too, so nothing behind it is pressed
     * by accident; the page is padded by its height, so nothing is lost under it. */
    '.rtg-sticky{position:fixed;left:0;right:0;bottom:var(--rtg-sticky-lift,0px);z-index:35;text-align:center;background:#0b0f17;box-shadow:0 -4px 14px rgba(0,0,0,.25)}',
    '.rtg-sticky:not(:has(ins[data-ad-status="filled"])){height:0;overflow:hidden}',
    '.rtg-sticky-in{display:inline-block;padding:0 4px 4px;padding-bottom:calc(4px + env(safe-area-inset-bottom,0px))}',
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
    if (z) { z.remove(); tell(); }
  }
  function tell() { try { root.dispatchEvent(new Event('rtg-sticky')); } catch (e) {} }
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
      var z0 = o && o.z ? String(o.z) : '';
      var have = document.querySelector('[data-ad-zone="sticky"]');
      var other = document.querySelector('[data-ad-zone="draft"],[data-ad-zone="season"]');
      if (!on || !slot || closed(group) || other) { dropSticky(); return; }
      if (have) { have.style.zIndex = z0; return; }
      style();
      var body = document.body;
      if (!document.documentElement.style.getPropertyValue('--rtg-body-pb')) {
        document.documentElement.style.setProperty('--rtg-body-pb', getComputedStyle(body).paddingBottom || '0px');
      }
      var z = document.createElement('div');
      z.className = 'rtg-sticky';
      z.setAttribute('data-ad-zone', 'sticky');
      z.style.zIndex = z0;
      z.innerHTML = '<div class="rtg-sticky-in"><div class="rtg-sticky-top"><span class="rtg-sticky-lbl">Advertisement</span>' +
        '<button type="button" class="rtg-sticky-x" aria-label="Close ad">&#x2715;</button></div>' +
        '<ins class="adsbygoogle" data-ad-client="' + CLIENT + '" data-ad-slot="' + slot + '"></ins></div>';
      z.querySelector('.rtg-sticky-x').addEventListener('click', function () { remember(group); dropSticky(); });
      body.appendChild(z);
      body.classList.add('rtg-sticky-on');
      if (root.ResizeObserver) {
        size = new ResizeObserver(function () { document.documentElement.style.setProperty('--sticky-ad-h', z.offsetHeight + 'px'); tell(); });
        size.observe(z);
      }
      push();
    } catch (e) {}
  }

  /* ---------- clearance ---------- */
  /* Every control near a rail's band (the rail plus 150px each side) that starts above the rail's top
     and ends within 150px of it pushes the rail down to 150px below it. Both rails take the lower of
     the two tops, so they stay level. A rail pinned to the window measures in window terms. */
  var CONTROLS = 'a[href],button,input,select,textarea,[role="button"],[onclick],[tabindex]:not([tabindex="-1"])';
  function clear(nodes) {
    try {
      nodes = Array.prototype.slice.call(nodes || []);
      if (!nodes.length) return;
      var fixed = nodes[0].classList.contains('rtg-rail-fixed') || getComputedStyle(nodes[0]).position === 'fixed';
      var sy = fixed ? 0 : root.scrollY;
      var bands = nodes.map(function (n) { var r = n.getBoundingClientRect(); return { l: r.left - GAP, r: r.right + GAP, top: r.top + sy, h: r.height || 600 }; });
      var top = Math.max.apply(null, bands.map(function (b) { return b.top; }));
      var vw = root.innerWidth, vh = root.innerHeight;
      var ctl = Array.prototype.slice.call(document.querySelectorAll(CONTROLS)).filter(function (e) {
        if (e.closest('[data-ad-zone]')) return false;
        var c = getComputedStyle(e);
        if (!e.offsetWidth || !e.offsetHeight || c.visibility === 'hidden' || c.display === 'none') return false;
        var q = e.getBoundingClientRect();
        if (q.right <= 0 || q.left >= vw) return false;             // a closed drawer parked off screen
        /* covered by something (a full screen overlay over the page behind it): not a control the
           player can reach, so not one to keep clear of. Only testable while it is on screen. */
        var cx = q.left + q.width / 2, cy = q.top + q.height / 2;
        if (cx >= 0 && cx < vw && cy >= 0 && cy < vh) {
          var hit = document.elementFromPoint(cx, cy);
          if (hit && hit !== e && !e.contains(hit) && !hit.contains(e) && !hit.closest('[data-ad-zone]')) return false;
        }
        return true;
      }).map(function (e) { var r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top + sy, b: r.bottom + sy }; });
      for (var pass = 0; pass < 6; pass++) {
        var need = top;
        ctl.forEach(function (c) {
          bands.forEach(function (b) {
            if (c.r <= b.l || c.l >= b.r) return;          // not beside this rail
            if (c.t >= top) return;                         // starts at or below the rail's top: not ours to clear
            if (c.b + GAP > need) need = c.b + GAP;
          });
        });
        if (need <= top) break;
        top = Math.round(need);
      }
      nodes.forEach(function (n) { n.style.top = top + 'px'; });
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
      if (have.length) { have.forEach(function (x) { x.style.left = at[x.getAttribute('data-side')]; x.style.top = top; }); clear(have); return; }
      style();
      var made = [];
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
        made.push(z);
      });
      clear(made);
      made.forEach(function () { push(); });
    } catch (e) {}
  }
  root.addEventListener('resize', function () { if (last) rails(last.on, last.slots, last.col, last.o); });

  root.RTG_ADS = { sticky: sticky, rails: rails, clear: clear, dropSticky: dropSticky, dropRails: dropRails };
})(window);
