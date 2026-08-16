/* type.js: typed answers for the arcade (window.RTGType).
 *
 * Four choices test recognition. Typing tests knowledge, and it is the
 * difference between "I know it when I see it" and actually knowing it. This
 * is the machinery three games needed at once, lifted out of Sportegories
 * where it was already working and already load-bearing:
 *
 *   RTGType.mount(input, {source, onPick, accent})   attach the typeahead
 *   RTGType.playerSource(entities)                   a name suggester
 *   RTGType.collegeSource(entities)                  a college suggester
 *   RTGType.sameName(typed, target)                  did they name this player
 *   RTGType.sameCollege(typed, target)               did they name this school
 *
 * WHY A CUSTOM DROPDOWN AND NOT <datalist>
 * Native datalist renders as a cramped strip on iOS, cannot be styled, cannot
 * be tapped reliably and gives no keyboard affordance. On a phone the
 * suggester IS the interface, so it has to be a real, tappable list.
 *
 * WHAT COUNTS AS THE SAME NAME
 * Accents, punctuation, casing and generational suffixes are all noise:
 * "Ken Griffey Jr." and "ken griffey" name the same person to anyone who
 * means them. First and last are required, because a bare surname is a
 * different (and much easier) game. A middle name is ignored, so "Michael
 * Jeffrey Jordan" still lands.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.RTGType = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUFFIX = { jr: 1, sr: 1, ii: 1, iii: 1, iv: 1, v: 1 };

  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function tokens(s) {
    return String(s == null ? '' : s).trim().split(/\s+/).map(norm).filter(Boolean);
  }
  // Drop generational suffixes but never the last name standing, so "Griffey
  // Jr" reduces to one name and is correctly refused as a full name.
  function trimSuffix(t) { var o = t.slice(); while (o.length > 1 && SUFFIX[o[o.length - 1]]) o.pop(); return o; }
  function nameKey(s) {
    var t = trimSuffix(tokens(s));
    if (!t.length) return null;
    return t.length === 1 ? t[0] + '|' + t[0] : t[0] + '|' + t[t.length - 1];
  }
  function hasFullName(s) { return trimSuffix(tokens(s)).length >= 2; }
  function sameName(typed, target) {
    var a = nameKey(typed), b = nameKey(target);
    return !!a && !!b && a === b;
  }

  /* Schools go by several names and people type the short one. "UNC",
     "North Carolina" and "University of North Carolina" are one answer, so
     strip the institutional words and compare what is left, plus a small
     alias table for the ones no rule can reach. */
  /* Single words only. An earlier version also listed "state university", and
     because the engine takes the first alternative that matches at a position,
     "Ohio State University" lost the word State and became Ohio. */
  var SCHOOL_NOISE = /\b(university|univ|college|of|the|at|institute)\b/gi;
  var SCHOOL_ALIAS = {
    unc: 'northcarolina', uconn: 'connecticut', ucf: 'centralflorida', ucla: 'ucla',
    usc: 'southerncalifornia', lsu: 'louisianastate', smu: 'southernmethodist',
    tcu: 'texaschristian', byu: 'brighamyoung', vcu: 'virginiacommonwealth',
    unlv: 'nevadalasvegas', utep: 'texaselpaso', umass: 'massachusetts',
    olemiss: 'mississippi', pitt: 'pittsburgh', cal: 'california',
    vatech: 'virginiatech', gatech: 'georgiatech', okstate: 'oklahomastate',
    ndstate: 'northdakotastate', fsu: 'floridastate', asu: 'arizonastate',
    osu: 'ohiostate', psu: 'pennstate', msu: 'michiganstate'
  };
  function schoolWords(s) {
    var raw = String(s == null ? '' : s);
    var whole = norm(raw);
    if (SCHOOL_ALIAS[whole]) return [SCHOOL_ALIAS[whole]];
    var w = raw.replace(SCHOOL_NOISE, ' ').split(/\s+/).map(norm).filter(Boolean);
    var joined = w.join('');
    if (SCHOOL_ALIAS[joined]) return [SCHOOL_ALIAS[joined]];
    return w.length ? w : (whole ? [whole] : []);
  }
  function schoolKey(s) { return schoolWords(s).join(''); }
  /* Word-wise, not prefix-wise. A plain prefix test cleared "Michigan" against
     "Michigan State", which are two different schools and a wrong answer. The
     only extra word allowed is a two-letter state code, which is how the data
     disambiguates "Miami (FL)" from "Miami (OH)". */
  var QUALIFIER = /^[a-z]{2}$/;
  function sameCollege(typed, target) {
    var a = schoolWords(typed), b = schoolWords(target);
    if (!a.length || !b.length) return false;
    if (a.join('') === b.join('')) return true;
    var shortW = a.length <= b.length ? a : b, longW = a.length <= b.length ? b : a;
    for (var i = 0; i < shortW.length; i++) if (shortW[i] !== longW[i]) return false;
    for (var j = shortW.length; j < longW.length; j++) if (!QUALIFIER.test(longW[j])) return false;
    return true;
  }

  // ---------- suggestion sources ----------
  /* Suggesters search the whole pool they are given, never the round's answer
     set. A suggester that knew the answer would be handing it over. */
  function playerSource(entities, opts) {
    opts = opts || {};
    var list = (entities || []).filter(function (e) { return e && e.name; });
    if (opts.sport) list = list.filter(function (e) { return e.sport === opts.sport; });
    // Best-known first, so the eight slots go to names people mean.
    list = list.slice().sort(function (a, b) { return (b.f || 0) - (a.f || 0); });
    var idx = list.map(function (e) {
      var t = trimSuffix(tokens(e.name));
      return { name: e.name, first: t[0] || '', last: t.length > 1 ? t[t.length - 1] : (t[0] || ''), sport: e.sport };
    });
    /* Surname matches rank above first-name matches, because people type the
       surname when they are reaching for a half-remembered name and the first
       name when they already know it. The league rides along as a sub-label:
       two players share a name more often than you would think, and it is the
       difference between a suggester that helps and one that guesses. */
    return function (prefix, limit) {
      var q = norm(prefix), last = [], first = [], seen = {};
      if (q.length < 2) return [];
      var cap = (limit || 8);
      for (var i = 0; i < idx.length && (last.length + first.length) < cap * 2; i++) {
        var p = idx[i];
        if (seen[p.name]) continue;
        if (p.last.indexOf(q) === 0) { seen[p.name] = 1; last.push({ value: p.name, sub: p.sport }); }
        else if (p.first.indexOf(q) === 0 || (p.first + p.last).indexOf(q) === 0) {
          seen[p.name] = 1; first.push({ value: p.name, sub: p.sport });
        }
      }
      return last.concat(first).slice(0, cap);
    };
  }
  function collegeSource(entities) {
    var count = {};
    (entities || []).forEach(function (e) { if (e && e.col) count[e.col] = (count[e.col] || 0) + 1; });
    // Most-attended first: the school a hundred pros went to is the one being typed.
    var list = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
    var idx = list.map(function (c) { return { name: c, k: norm(c), words: c.split(/\s+/).map(norm) }; });
    return function (prefix, limit) {
      var q = norm(prefix), out = [];
      if (q.length < 2) return out;
      for (var i = 0; i < idx.length && out.length < (limit || 8); i++) {
        var c = idx[i];
        if (c.k.indexOf(q) === 0 || c.words.some(function (w) { return w.indexOf(q) === 0; })) out.push(c.name);
      }
      return out;
    };
  }

  // ---------- the dropdown ----------
  var box = null, items = [], ix = -1, forEl = null, timer = null, cfgOf = null;
  var raf = 0, lastRect = '';
  var STYLE_ID = 'rtgtype-css';
  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.rtgtype-box{position:fixed; z-index:9700; background:var(--card,#0F2136);' +
      ' border:2px solid var(--rtgt-accent,#2F6BFF); border-radius:14px;' +
      ' box-shadow:0 22px 50px -16px rgba(0,0,0,.75); overflow:hidden auto;' +
      ' -webkit-overflow-scrolling:touch; overscroll-behavior:contain;' +
      ' font-family:inherit; animation:rtgtypeIn .12s ease-out;}' +
      '@keyframes rtgtypeIn{from{opacity:0; transform:translateY(-4px);}to{opacity:1; transform:none;}}' +
      '.rtgtype-box[hidden]{display:none;}' +
      /* squared off on the edge that faces the field, so the list reads as an
         extension of it rather than a separate floating panel */
      '.rtgtype-box.below{border-top-left-radius:4px; border-top-right-radius:4px;}' +
      '.rtgtype-box.above{border-bottom-left-radius:4px; border-bottom-right-radius:4px;}' +
      '.rtgtype-hd{display:block; padding:7px 13px 6px; font-size:9.5px; font-weight:900;' +
      ' letter-spacing:.12em; text-transform:uppercase; color:var(--mut,#93A7BE);' +
      ' background:var(--card2,#16293f); border-bottom:1px solid var(--line,rgba(255,255,255,.10));}' +
      '.rtgtype-item{display:flex; align-items:center; gap:10px; width:100%; text-align:left;' +
      ' appearance:none; border:0; cursor:pointer; background:transparent; font-family:inherit;' +
      ' font-size:16px; font-weight:800; color:var(--ink,#EAF1FA); padding:13px 13px; min-height:52px;' +
      ' border-top:1px solid var(--line,rgba(255,255,255,.09));}' +
      '.rtgtype-item:first-of-type{border-top:0;}' +
      '.rtgtype-item .rtgtype-txt{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}' +
      /* the part you already typed, so you can see the match land */
      '.rtgtype-item .rtgtype-txt u{text-decoration:none; color:var(--rtgt-accent,#2F6BFF);}' +
      '.rtgtype-item .rtgtype-sub{flex:0 0 auto; font-size:10px; font-weight:900; letter-spacing:.07em;' +
      ' text-transform:uppercase; color:var(--mut,#93A7BE); border:1px solid var(--line2,rgba(255,255,255,.18));' +
      ' border-radius:999px; padding:3px 8px;}' +
      '.rtgtype-item.on,.rtgtype-item:hover{background:color-mix(in srgb, var(--rtgt-accent,#2F6BFF) 20%, transparent);}' +
      '.rtgtype-item.on .rtgtype-sub{border-color:var(--rtgt-accent,#2F6BFF); color:var(--ink,#EAF1FA);}' +
      '.rtgtype-item:active{background:color-mix(in srgb, var(--rtgt-accent,#2F6BFF) 32%, transparent);}' +
      /* the field itself: a clear button that does not fight the caret */
      '.rtgtype-wrap{position:relative; display:flex; flex:1; min-width:0;}' +
      '.rtgtype-wrap > input{flex:1; min-width:0;}' +
      '.rtgtype-clear{position:absolute; right:6px; top:50%; transform:translateY(-50%);' +
      ' width:32px; height:32px; border-radius:50%; border:0; padding:0; cursor:pointer;' +
      ' background:var(--card2,#16293f); color:var(--mut,#93A7BE); font-size:15px; line-height:1;' +
      ' display:none; align-items:center; justify-content:center;}' +
      '.rtgtype-clear.on{display:flex;}' +
      '.rtgtype-clear:hover{color:var(--ink,#EAF1FA);}';
    document.head.appendChild(s);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* Suggestions may be plain strings or {value, sub} so a name can carry the
     league it belongs to. Two players share a name more often than you would
     think, and "Bobby Jones NBA" versus "Bobby Jones NFL" is the difference
     between a suggester that helps and one that guesses for you. */
  function valOf(it) { return (it && typeof it === 'object') ? it.value : it; }
  function subOf(it) { return (it && typeof it === 'object') ? (it.sub || '') : ''; }

  function ensureBox() {
    if (box) return box;
    injectCSS();
    box = document.createElement('div');
    box.className = 'rtgtype-box';
    box.id = 'rtgtype-box';
    box.setAttribute('role', 'listbox');
    box.hidden = true;
    document.body.appendChild(box);
    // pointerdown beats blur, so the tap lands before the field closes the list
    box.addEventListener('pointerdown', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.rtgtype-item') : null;
      if (!b) return;
      ev.preventDefault();
      pick(parseInt(b.getAttribute('data-i'), 10));
    });
    return box;
  }
  function close() {
    stopTrack();
    if (!box || box.hidden) return;
    box.hidden = true; items = []; ix = -1;
    if (forEl) forEl.setAttribute('aria-expanded', 'false');
    forEl = null; cfgOf = null;
  }

  /* THE VIEWPORT THAT MATTERS IS THE VISUAL ONE.
     window.innerHeight is the LAYOUT viewport, which on a phone runs on behind
     the on-screen keyboard. Measuring against it put the list under the
     keyboard, or flipped it to a place there was no room for either. */
  function vv() {
    var v = window.visualViewport;
    return v ? { top: v.offsetTop, left: v.offsetLeft, w: v.width, h: v.height }
             : { top: 0, left: 0, w: window.innerWidth, h: window.innerHeight };
  }
  function place(el) {
    var r = el.getBoundingClientRect(), V = vv(), GAP = 5, PAD = 8;
    var below = (V.top + V.h) - r.bottom - GAP - PAD;
    var above = r.top - V.top - GAP - PAD;
    var goBelow = below >= 160 || below >= above;
    var room = Math.max(96, Math.floor(goBelow ? below : above));
    box.classList.toggle('below', goBelow);
    box.classList.toggle('above', !goBelow);
    box.style.maxHeight = Math.min(room, 320) + 'px';
    // never wider than the visual viewport, and never hanging off either edge
    var w = Math.round(Math.min(r.width, V.w - 16));
    var left = Math.round(Math.min(Math.max(r.left, V.left + 8), V.left + V.w - w - 8));
    box.style.width = w + 'px';
    box.style.left = left + 'px';
    if (goBelow) { box.style.bottom = ''; box.style.top = Math.round(r.bottom + GAP) + 'px'; }
    else { box.style.top = ''; box.style.bottom = Math.round((V.top + V.h) - r.top + GAP) + 'px'; }
  }
  /* Follow the field. A fixed-position list is anchored to the layout viewport,
     and the moment iOS scrolls the page to lift a focused input clear of the
     keyboard, the list stays behind and ends up floating hundreds of pixels
     away from the field it belongs to. That scroll does not reliably fire a
     window scroll event, so the only dependable fix is to re-measure on every
     frame while the list is open. It is one getBoundingClientRect per frame,
     and it only writes when the number actually changed. */
  function track() {
    raf = 0;
    if (!forEl || !box || box.hidden) return;
    var r = forEl.getBoundingClientRect(), V = vv();
    var key = Math.round(r.top) + '|' + Math.round(r.left) + '|' + Math.round(r.width) + '|' + Math.round(V.h) + '|' + Math.round(V.top);
    if (key !== lastRect) { lastRect = key; place(forEl); }
    raf = requestAnimationFrame(track);
  }
  function startTrack() {
    if (raf || typeof requestAnimationFrame !== 'function') return;
    lastRect = '';
    raf = requestAnimationFrame(track);
  }
  function stopTrack() {
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
  }

  function markup(it, i, q) {
    var v = valOf(it), sub = subOf(it);
    var lab = esc(v);
    // bold the characters already typed, wherever they matched
    if (q) {
      var nv = norm(v), nq = norm(q);
      var at = nv.indexOf(nq);
      if (at === 0) {
        // walk the raw string until `nq.length` normalised chars are consumed
        var used = 0, cut = 0;
        for (var k = 0; k < v.length && used < nq.length; k++) { if (norm(v[k])) used++; cut = k + 1; }
        lab = '<u>' + esc(v.slice(0, cut)) + '</u>' + esc(v.slice(cut));
      }
    }
    return '<button type="button" class="rtgtype-item' + (i === ix ? ' on' : '') + '" data-i="' + i + '"' +
           ' role="option" aria-selected="' + (i === ix) + '" tabindex="-1">' +
           '<span class="rtgtype-txt">' + lab + '</span>' +
           (sub ? '<span class="rtgtype-sub">' + esc(sub) + '</span>' : '') +
           '</button>';
  }
  function paint(q, head) {
    box.innerHTML = (head ? '<span class="rtgtype-hd">' + esc(head) + '</span>' : '') +
      items.map(function (it, i) { return markup(it, i, q); }).join('');
    if (ix >= 0) {
      var on = box.querySelector('.rtgtype-item.on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }
  }
  function pick(i) {
    if (!forEl || i < 0 || i >= items.length) return;
    var el = forEl, cfg = cfgOf, val = valOf(items[i]);
    el.value = val;
    syncClear(el);
    close();
    if (cfg && cfg.onPick) cfg.onPick(val, el);
  }
  function onKey(e, cfg) {
    if (box && !box.hidden && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); ix = (ix + 1) % items.length; paint(lastQ, cfg.head); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); ix = (ix - 1 + items.length) % items.length; paint(lastQ, cfg.head); return; }
      if (e.key === 'Escape') { close(); return; }
      // Tab accepts the highlighted suggestion without submitting, which is how
      // every other typeahead on a keyboard behaves
      if (e.key === 'Tab' && ix >= 0) { e.preventDefault(); pick(ix); return; }
      if (e.key === 'Enter' && ix >= 0) { e.preventDefault(); pick(ix); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); close(); if (cfg.onSubmit) cfg.onSubmit(e.target.value, e.target); }
  }
  var lastQ = '';

  /* iOS shows its "AutoFill Contact" bar over the keyboard whenever Safari
     decides a text field wants a person's name, which our fields do by their
     nature. autocomplete="off" alone is routinely ignored; the combination
     that actually works is a non-contact name attribute, an explicit
     off/none set, and keeping the field OUT of a <form> (Safari's heuristics
     are far more aggressive inside one). The password managers get their own
     opt-out attributes. */
  function harden(el) {
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
    el.setAttribute('data-lpignore', 'true');
    el.setAttribute('data-1p-ignore', '');
    el.setAttribute('data-form-type', 'other');
    if (!el.getAttribute('name')) el.setAttribute('name', 'rtg-answer');
    if (!el.getAttribute('enterkeyhint')) el.setAttribute('enterkeyhint', 'go');
  }
  function syncClear(el) {
    var w = el.parentNode;
    if (!w || !w.classList || !w.classList.contains('rtgtype-wrap')) return;
    var b = w.querySelector('.rtgtype-clear');
    if (b) b.classList.toggle('on', !!el.value);
  }
  function addClear(el) {
    var parent = el.parentNode;
    if (!parent || (parent.classList && parent.classList.contains('rtgtype-wrap'))) return;
    var wrap = document.createElement('span');
    wrap.className = 'rtgtype-wrap';
    parent.insertBefore(wrap, el);
    wrap.appendChild(el);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rtgtype-clear';
    btn.setAttribute('aria-label', 'Clear');
    btn.textContent = '\u2715';
    btn.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      el.value = ''; syncClear(el); close();
      try { el.focus(); } catch (_) {}
    });
    wrap.appendChild(btn);
  }

  function mount(el, cfg) {
    if (!el || !cfg || !cfg.source) return;
    injectCSS();
    harden(el);
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-expanded', 'false');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-controls', 'rtgtype-box');
    if (cfg.accent) el.style.setProperty('--rtgt-accent', cfg.accent);
    if (cfg.clear !== false) addClear(el);
    function refresh() {
      if (document.activeElement !== el) return;
      var q = el.value;
      var list = cfg.source(q, cfg.max || 8) || [];
      if (!list.length) { close(); return; }
      ensureBox();
      if (cfg.accent) box.style.setProperty('--rtgt-accent', cfg.accent);
      items = list; ix = -1; forEl = el; cfgOf = cfg; lastQ = q;
      el.setAttribute('aria-expanded', 'true');
      paint(q, cfg.head);
      box.hidden = false;
      place(el);
      startTrack();
    }
    el.addEventListener('input', function () {
      syncClear(el);
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 70);
    });
    // Coming back to a field that already has text should show its list again
    el.addEventListener('focus', function () {
      syncClear(el);
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 90);
    });
    el.addEventListener('keydown', function (e) { onKey(e, cfg); });
    el.addEventListener('blur', function () { setTimeout(close, 130); });
  }
  // Guard on the method, not on the global: the node test harness defines a
  // bare `window` object to load the corpus files into.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    var reflow = function () { if (forEl && box && !box.hidden) { lastRect = ''; place(forEl); } };
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', reflow);
      window.visualViewport.addEventListener('scroll', reflow);
    }
  }

  return {
    mount: mount, close: close, harden: harden,
    norm: norm, tokens: tokens, nameKey: nameKey, hasFullName: hasFullName,
    sameName: sameName, schoolKey: schoolKey, sameCollege: sameCollege,
    playerSource: playerSource, collegeSource: collegeSource
  };
});
