/* tour.js: the walkthrough a first-timer actually needs (window.RTGTour).
 *
 *   RTGTour.once('hub', STEPS)     run on a first visit, then never again
 *   RTGTour.start('hub', STEPS)    run it now regardless
 *   RTGTour.available(key)         is there a tour for this page
 *
 * WHY
 * Someone landing here cold got two lines on an overlay and four bullets
 * behind a question mark. Nothing said what this place is, what the league
 * tabs do, what a streak is for, or which of ten games to open first. Rules
 * text does not fix that, because the problem is not "what are the rules of
 * this game", it is "what am I looking at and what do I do now". So the
 * walkthrough points at the real thing on the real screen and says what it is.
 *
 * A step whose target is missing is skipped rather than pointing at nothing,
 * which is what lets one definition cover pages that do not all have a league
 * switcher or a leaderboard.
 */
(function () {
  'use strict';

  var SEEN = 'rtg:tour:';
  var scrim = null, hole = null, card = null, arrow = null;
  var steps = [], at = 0, raf = 0, lastKey = '', onEnd = null, tourKey = '';

  function seen(k) { try { return !!localStorage.getItem(SEEN + k); } catch (e) { return true; } }
  function mark(k) { try { localStorage.setItem(SEEN + k, '1'); } catch (e) {} }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function vv() {
    var v = window.visualViewport;
    return v ? { top: v.offsetTop, left: v.offsetLeft, w: v.width, h: v.height }
             : { top: 0, left: 0, w: window.innerWidth, h: window.innerHeight };
  }
  /* Two different questions, and conflating them cost two steps.
     exists(): is this element on the page at all? Decides whether the STEP is
     worth keeping, and it has to be forgiving, because plenty of these mount a
     beat after the page does.
     target(): does it have a box to draw a spotlight around right now? Decides
     whether this FRAME gets an arrow. A header that only gains height once the
     first row fills in is real, but pointing at it would point at nothing, so
     the step still shows and simply centres its card. */
  function find(st) {
    if (!st || !st.sel) return null;
    try { return document.querySelector(st.sel); } catch (e) { return null; }
  }
  function exists(st) { return !st.sel || !!find(st); }
  function target(st) {
    var el = find(st);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return (r.width > 1 && r.height > 1) ? el : null;
  }

  function injectCSS() {
    if (document.getElementById('rtgtour-css')) return;
    var s = document.createElement('style');
    s.id = 'rtgtour-css';
    s.textContent = [
      '.rtgtour-scrim{position:fixed; inset:0; z-index:9800; display:none;}',
      '.rtgtour-scrim.on{display:block;}',
      /* The dim is a giant shadow cast OUTWARD from the hole, so the thing
         being explained is genuinely undimmed and still legible underneath. */
      '.rtgtour-hole{position:fixed; border-radius:14px; pointer-events:none;',
      ' box-shadow:0 0 0 9999px rgba(3,9,18,.74); border:3px solid var(--brand,#FF8A3D);',
      ' transition:top .28s cubic-bezier(.4,0,.2,1), left .28s cubic-bezier(.4,0,.2,1),',
      ' width .28s cubic-bezier(.4,0,.2,1), height .28s cubic-bezier(.4,0,.2,1);}',
      '.rtgtour-hole.nofocus{box-shadow:0 0 0 9999px rgba(3,9,18,.80); border-color:transparent;}',
      /* the arrow: a solid triangle in the accent, pointing at the hole */
      '.rtgtour-arrow{position:fixed; width:0; height:0; z-index:9802; pointer-events:none;',
      ' filter:drop-shadow(0 3px 6px rgba(0,0,0,.45)); transition:top .28s, left .28s;}',
      '.rtgtour-arrow.up{border-left:13px solid transparent; border-right:13px solid transparent;',
      ' border-bottom:15px solid var(--brand,#FF8A3D);}',
      '.rtgtour-arrow.down{border-left:13px solid transparent; border-right:13px solid transparent;',
      ' border-top:15px solid var(--brand,#FF8A3D);}',
      '.rtgtour-card{position:fixed; z-index:9803; width:min(360px, calc(100vw - 28px));',
      ' background:var(--card,#10233A); color:var(--ink,#F4F7FB);',
      ' border:2px solid var(--brand,#FF8A3D); border-radius:16px; padding:16px 16px 14px;',
      ' box-shadow:0 26px 70px -18px rgba(0,0,0,.8); font-family:var(--f,inherit);',
      ' transition:top .28s cubic-bezier(.4,0,.2,1), left .28s cubic-bezier(.4,0,.2,1);}',
      '.rtgtour-step{font-size:10px; font-weight:900; letter-spacing:.13em; text-transform:uppercase;',
      ' color:var(--brand,#FF8A3D); margin-bottom:6px;}',
      '.rtgtour-t{font-family:var(--hero,inherit); font-weight:400; letter-spacing:.02em;',
      ' text-transform:uppercase; font-size:21px; line-height:1.05; margin:0 0 7px;}',
      '.rtgtour-b{font-size:14px; line-height:1.5; font-weight:600; color:var(--ink,#F4F7FB); margin:0 0 14px;}',
      '.rtgtour-b b{color:var(--brand,#FF8A3D); font-weight:900;}',
      '.rtgtour-row{display:flex; align-items:center; gap:10px;}',
      '.rtgtour-skip{appearance:none; border:0; background:transparent; cursor:pointer; padding:10px 2px;',
      ' font-family:inherit; font-size:12.5px; font-weight:800; color:var(--mut,#93A7BE);}',
      '.rtgtour-skip:hover{color:var(--ink,#F4F7FB);}',
      '.rtgtour-next{margin-left:auto; appearance:none; border:0; cursor:pointer; border-radius:11px;',
      ' padding:12px 20px; min-height:46px; font-family:inherit; font-weight:900; font-size:14px;',
      ' background:var(--brand,#FF8A3D); color:var(--onAccent,#160B02);}',
      '.rtgtour-next:hover{filter:brightness(1.07);}',
      '.rtgtour-back{appearance:none; border:1px solid var(--line2,rgba(255,255,255,.18)); cursor:pointer;',
      ' border-radius:11px; padding:12px 14px; min-height:46px; background:transparent;',
      ' font-family:inherit; font-weight:800; font-size:13px; color:var(--ink,#F4F7FB);}',
      /* the entry point, so the tour is never a one-time thing you missed */
      '.rtgtour-open{display:inline-flex; align-items:center; gap:7px; appearance:none; cursor:pointer;',
      ' border:1px dashed var(--line2,rgba(255,255,255,.20)); background:transparent; border-radius:999px;',
      ' padding:9px 15px; min-height:40px; font-family:var(--f,inherit); font-weight:800; font-size:12.5px;',
      ' color:var(--mut,#93A7BE);}',
      '.rtgtour-open:hover{color:var(--ink,#F4F7FB); border-color:var(--brand,#FF8A3D);}',
      '.rtgtour-open b{color:var(--brand,#FF8A3D); font-weight:900;}'
    ].join('');
    document.head.appendChild(s);
  }

  function build() {
    if (scrim) return;
    injectCSS();
    scrim = document.createElement('div');
    scrim.className = 'rtgtour-scrim';
    scrim.setAttribute('role', 'dialog');
    scrim.setAttribute('aria-modal', 'true');
    scrim.setAttribute('aria-label', 'How this works');
    hole = document.createElement('div'); hole.className = 'rtgtour-hole';
    arrow = document.createElement('div'); arrow.className = 'rtgtour-arrow';
    card = document.createElement('div'); card.className = 'rtgtour-card';
    scrim.appendChild(hole); scrim.appendChild(arrow); scrim.appendChild(card);
    document.body.appendChild(scrim);
    card.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button') : null;
      if (!b) return;
      if (b.classList.contains('rtgtour-next')) next();
      else if (b.classList.contains('rtgtour-back')) back();
      else if (b.classList.contains('rtgtour-skip')) finish();
    });
    // Tapping the dim advances too. People try it, and having nothing happen
    // reads as broken.
    scrim.addEventListener('click', function (ev) { if (ev.target === scrim || ev.target === hole) next(); });
    document.addEventListener('keydown', function (ev) {
      if (!scrim.classList.contains('on')) return;
      if (ev.key === 'Escape') { ev.preventDefault(); finish(); }
      else if (ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); next(); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); back(); }
    });
  }

  function layout() {
    var st = steps[at], el = target(st), V = vv();
    var GAP = 14, M = 10;
    var r = el ? el.getBoundingClientRect() : null;
    if (r && (r.width < 1 || r.height < 1)) r = null;

    if (r) {
      var pad = st.pad == null ? 6 : st.pad;
      hole.classList.remove('nofocus');
      hole.style.top = Math.round(r.top - pad) + 'px';
      hole.style.left = Math.round(r.left - pad) + 'px';
      hole.style.width = Math.round(r.width + pad * 2) + 'px';
      hole.style.height = Math.round(r.height + pad * 2) + 'px';
    } else {
      // a step with nothing to point at still dims the page and reads as a card
      hole.classList.add('nofocus');
      hole.style.top = '-40px'; hole.style.left = '50%';
      hole.style.width = '0px'; hole.style.height = '0px';
    }

    var ch = card.offsetHeight || 190, cw = card.offsetWidth || 320;
    var below = r ? (V.top + V.h) - (r.bottom + GAP) - M : 0;
    var above = r ? (r.top - GAP) - V.top - M : 0;
    var goBelow = !r ? true : (below >= ch ? true : (above >= ch ? false : below >= above));

    var top, aTop, aCls;
    if (!r) {
      top = Math.round(V.top + (V.h - ch) / 2);
      arrow.style.display = 'none';
    } else if (goBelow) {
      top = Math.round(Math.min(r.bottom + GAP, V.top + V.h - ch - M));
      aTop = Math.round(top - 15); aCls = 'up';
      arrow.style.display = '';
    } else {
      top = Math.round(Math.max(r.top - GAP - ch, V.top + M));
      aTop = Math.round(top + ch); aCls = 'down';
      arrow.style.display = '';
    }
    var cx = r ? (r.left + r.width / 2) : (V.left + V.w / 2);
    var left = Math.round(Math.min(Math.max(cx - cw / 2, V.left + M), V.left + V.w - cw - M));
    card.style.top = top + 'px';
    card.style.left = left + 'px';
    if (r) {
      arrow.className = 'rtgtour-arrow ' + aCls;
      arrow.style.top = aTop + 'px';
      arrow.style.left = Math.round(Math.min(Math.max(cx - 13, left + 14), left + cw - 40)) + 'px';
    }
  }

  function track() {
    raf = 0;
    if (!scrim || !scrim.classList.contains('on')) return;
    var el = target(steps[at]), V = vv();
    var r = el ? el.getBoundingClientRect() : null;
    var key = (r ? Math.round(r.top) + '|' + Math.round(r.left) + '|' + Math.round(r.width) + '|' + Math.round(r.height) : 'none')
            + '|' + Math.round(V.h) + '|' + Math.round(V.top);
    if (key !== lastKey) { lastKey = key; layout(); }
    raf = requestAnimationFrame(track);
  }

  function render() {
    var st = steps[at];
    var last = at === steps.length - 1;
    card.innerHTML =
      '<div class="rtgtour-step">Step ' + (at + 1) + ' of ' + steps.length + '</div>' +
      '<h2 class="rtgtour-t">' + esc(st.title) + '</h2>' +
      '<p class="rtgtour-b">' + (st.html || esc(st.body)) + '</p>' +
      '<div class="rtgtour-row">' +
        (at > 0 ? '<button type="button" class="rtgtour-back">Back</button>' : '') +
        '<button type="button" class="rtgtour-skip">' + (last ? '' : 'Skip the tour') + '</button>' +
        '<button type="button" class="rtgtour-next">' + esc(st.cta || (last ? 'Got it' : 'Next')) + '</button>' +
      '</div>';
    var el = target(st);
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
    }
    lastKey = '';
    layout();
    // re-measure once the card has its real height and the scroll has settled
    setTimeout(function () { lastKey = ''; layout(); }, 60);
    setTimeout(function () { lastKey = ''; layout(); }, 420);
  }

  function next() {
    var st = steps[at];
    if (at === steps.length - 1) {
      finish();
      if (st && st.href) location.href = st.href;
      return;
    }
    at++;
    while (at < steps.length - 1 && !exists(steps[at])) at++;   // gone from the page entirely
    render();
  }
  function back() {
    if (at === 0) return;
    at--;
    while (at > 0 && !exists(steps[at])) at--;
    render();
  }
  function finish() {
    if (!scrim) return;
    scrim.classList.remove('on');
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
    if (tourKey) mark(tourKey);
    document.documentElement.style.overflow = '';
    var cb = onEnd; onEnd = null;
    if (cb) try { cb(); } catch (e) {}
  }

  function start(key, list, opts) {
    opts = opts || {};
    list = (list || []).filter(exists);
    if (!list.length) return false;
    build();
    tourKey = key; steps = list; at = 0; onEnd = opts.onEnd || null;
    /* Marked as seen the moment it opens, not when it finishes. Someone who
       closes the tab halfway through has been shown it, and getting it again
       on every visit until they sit through the last card is nagging. The
       re-open button is how you get it back on purpose. */
    mark(key);
    scrim.classList.add('on');
    render();
    if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(track);
    return true;
  }
  function once(key, list, opts) {
    if (seen(key)) return false;
    return start(key, list, opts);
  }
  function replay(key, list, opts) {
    try { localStorage.removeItem(SEEN + key); } catch (e) {}
    return start(key, list, opts);
  }

  /* A button any page can drop in to re-open its walkthrough. Nobody should
     have to clear their storage to see the explanation twice. */
  function button(label) {
    injectCSS();
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rtgtour-open';
    b.innerHTML = '<b>?</b>' + esc(label || 'New here? Show me around');
    return b;
  }

  window.RTGTour = { start: start, once: once, replay: replay, finish: finish, button: button, seen: seen };
})();
