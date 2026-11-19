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
 *   RTG_ADS.rows(on, list, slot, o)    the leaderboard row ad: a 300x250 between a long board's
 *                                      rows. A board calls it after every paint. on: the board is
 *                                      open. list: the element whose children are the rows. slot:
 *                                      the game's *-board-row unit. o.row: the selector a row
 *                                      matches. o.offset: ranks drawn above the list (a podium).
 *                                      o.total: how many rows the board has in all.
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
 *  - The leaderboard row ad (the owner, 2026-11-19): under 80 rows, none. 80 to 149, one, in the
 *    middle. 150 or more, after rows 50, 100 and 150, each only with 30 rows below it. Never more
 *    than three. Each is asked for once, when its place has been near the screen for half a
 *    second (so a jump to your own row far down asks for nothing), and never again on a sort, a
 *    tab or a redraw: the ad sits in a layer beside the list, over an empty gap the list keeps for
 *    it, and a repaint only moves it. Clear space above and below, so a tap on a row never lands
 *    on it. Not while the desktop rails are up (one or the other). Removed when the board closes.
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
    '.rtg-rowgap{height:0;padding:0;margin:0;border:0;pointer-events:none}',
    '.rtg-rowlayer{position:relative;height:0;margin:0;padding:0;z-index:1}',
    '.rtg-rowad{position:absolute;left:50%;width:300px;margin-left:-150px;text-align:center}',
    '.rtg-rowad .rtg-row-lbl{display:block;height:16px;font:600 9.5px/16px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;opacity:.6}',
    '.rtg-rowad ins.adsbygoogle{display:block;width:300px;height:250px}',
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

  /* ---------- the leaderboard row ad ---------- */
  /* The gap a row ad takes in the list: clear space, the label, the ad, clear space. The gap is
     closed (0px) until the ad is asked for, so a board never shows an empty box, and closes again
     if Google sends nothing. */
  var ROW_CLEAR = 40, ROW_LBL = 16, ROW_AD = 250, ROW_GAP = ROW_CLEAR + ROW_LBL + ROW_AD + ROW_CLEAR;
  var ROW_NEAR = '400px 0px', ROW_DWELL = 500, ROW_MAX = 3;
  var rowState = null;
  /* Where the ads go, by rank, from how many rows the board has in all. */
  function rowRanks(n) {
    if (!(n >= 80)) return [];
    if (n < 150) return [Math.floor(n / 2)];
    return [50, 100, 150].filter(function (r) { return n - r >= 30; }).slice(0, ROW_MAX);
  }
  function railsUp() { return !!document.querySelector('[data-ad-zone="rail-x"]'); }
  function dropRows() {
    var st = rowState; rowState = null;
    if (!st) return;
    try {
      if (st.io) st.io.disconnect();
      if (st.mo) st.mo.disconnect();
      if (st.ro) st.ro.disconnect();
      root.removeEventListener('scroll', st.onScroll);
      root.removeEventListener('resize', st.onResize);
      if (st.layer) st.layer.remove();
      document.querySelectorAll('.rtg-rowgap').forEach(function (g) { g.remove(); });
    } catch (e) {}
  }
  /* Open or close a gap. A gap above the screen that changes height would move what the player is
     reading, so the scroll moves with it. */
  function gapTo(g, h) {
    var was = g.offsetHeight;
    if (was === h) return;
    var above = g.getBoundingClientRect().bottom <= 0;
    g.style.height = h + 'px';
    if (above) root.scrollBy(0, h - was);
  }
  /* Put every box over its gap, and hide the ones whose gap is gone (a repaint in flight, a
     shorter board, the rails up). Hiding never reloads an ad. */
  function placeRows() {
    var st = rowState;
    if (!st || !st.layer.isConnected) return;
    var lt = st.layer.getBoundingClientRect().top, off = railsUp();
    Object.keys(st.ads).forEach(function (rank) {
      var a = st.ads[rank], g = a.gap;
      var show = !off && a.state !== 'dead' && g && g.isConnected && a.box;
      if (a.box) a.box.style.visibility = show ? '' : 'hidden';
      if (show) a.box.style.top = Math.round(g.getBoundingClientRect().top - lt + ROW_CLEAR) + 'px';
    });
  }
  function askRow(a) {
    var st = rowState;
    if (!st || a.state !== 'idle' || railsUp()) return;
    a.state = 'asked';
    gapTo(a.gap, ROW_GAP);
    var b = document.createElement('div');
    b.className = 'rtg-rowad';
    b.setAttribute('data-ad-zone', 'row');
    b.innerHTML = '<span class="rtg-row-lbl">Advertisement</span><ins class="adsbygoogle" data-ad-client="' + CLIENT + '" data-ad-slot="' + st.slot + '"></ins>';
    st.layer.appendChild(b);
    a.box = b;
    var ins = b.querySelector('ins');
    /* Google sent nothing: close the gap for good on this board. */
    if (root.MutationObserver) {
      new MutationObserver(function (_, mo) {
        if (ins.getAttribute('data-ad-status') !== 'unfilled') return;
        mo.disconnect();
        a.state = 'dead';
        if (a.gap && a.gap.isConnected) gapTo(a.gap, 0);
        b.remove(); a.box = null;
        placeRows();
      }).observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
    }
    placeRows();
    push();
  }
  function rows(on, list, slot, o) {
    try {
      o = o || {};
      var el = typeof list === 'function' ? list() : list;
      if (!on || !slot || !el || !root.IntersectionObserver) { dropRows(); return; }
      if (rowState && rowState.list !== el) dropRows();
      style();
      var st = rowState;
      if (!st) {
        st = rowState = { list: el, slot: slot, ads: {} };
        st.layer = document.createElement('div');
        st.layer.className = 'rtg-rowlayer';
        el.parentNode.insertBefore(st.layer, el.nextSibling);
        var t = {};
        st.io = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            var rank = e.target.getAttribute('data-rank'), a = st.ads[rank];
            if (!a || a.gap !== e.target) return;
            clearTimeout(t[rank]);
            if (e.isIntersecting && a.state === 'idle') t[rank] = setTimeout(function () { if (a.gap === e.target && e.target.isConnected) askRow(a); }, ROW_DWELL);
          });
        }, { rootMargin: ROW_NEAR });
        var raf = 0;
        st.onScroll = function () { if (!raf) raf = root.requestAnimationFrame(function () { raf = 0; placeRows(); }); };
        st.onResize = function () { gapsFor(); placeRows(); };
        root.addEventListener('scroll', st.onScroll, { passive: true });
        root.addEventListener('resize', st.onResize);
        /* A repaint replaces the rows (and the gaps with them): hide the boxes at once, and the
           board's own call puts the gaps back. Rows that change height move the gaps. */
        if (root.MutationObserver) { st.mo = new MutationObserver(placeRows); st.mo.observe(el, { childList: true }); }
        if (root.ResizeObserver) { st.ro = new ResizeObserver(placeRows); st.ro.observe(el); }
      }
      st.o = o;
      gapsFor();
      placeRows();
    } catch (e) {}
  }
  /* Lay the gaps into the list as it is now. A place already asked for gets its gap open at once
     and its ad moved there; a new place gets a closed gap that asks when it comes near. */
  function gapsFor() {
    var st = rowState;
    if (!st) return;
    var el = st.list, o = st.o || {}, off = o.offset || 0;
    var kids = Array.prototype.slice.call(el.children).filter(function (k) { return !k.classList.contains('rtg-rowgap') && (!o.row || k.matches(o.row)); });
    var total = o.total != null ? o.total : kids.length + off;
    var want = rowRanks(total);
    el.querySelectorAll(':scope > .rtg-rowgap').forEach(function (g) { st.io.unobserve(g); g.remove(); });
    Object.keys(st.ads).forEach(function (r) { st.ads[r].gap = null; });
    if (railsUp()) return;
    want.forEach(function (rank) {
      var row = kids[rank - off - 1];
      if (!row || !kids[rank - off]) return;          // the row after it must be there too
      var a = st.ads[rank] || (st.ads[rank] = { state: 'idle', box: null, gap: null });
      if (a.state === 'dead') return;
      var g = document.createElement('div');
      g.className = 'rtg-rowgap';
      g.setAttribute('data-rank', rank);
      g.setAttribute('aria-hidden', 'true');
      if (a.state !== 'idle') g.style.height = ROW_GAP + 'px';
      row.parentNode.insertBefore(g, row.nextSibling);
      a.gap = g;
      if (a.state === 'idle') st.io.observe(g);
    });
  }

  root.RTG_ADS = { sticky: sticky, rails: rails, rows: rows, clear: clear, dropSticky: dropSticky, dropRails: dropRails, dropRows: dropRows };
})(window);
