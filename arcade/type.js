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
    return function (prefix, limit) {
      var q = norm(prefix), out = [], seen = {};
      if (q.length < 2) return out;
      for (var i = 0; i < idx.length && out.length < (limit || 7); i++) {
        var p = idx[i];
        if (seen[p.name]) continue;
        if (p.first.indexOf(q) === 0 || p.last.indexOf(q) === 0 || (p.first + p.last).indexOf(q) === 0) {
          seen[p.name] = 1; out.push(p.name);
        }
      }
      return out;
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
      for (var i = 0; i < idx.length && out.length < (limit || 7); i++) {
        var c = idx[i];
        if (c.k.indexOf(q) === 0 || c.words.some(function (w) { return w.indexOf(q) === 0; })) out.push(c.name);
      }
      return out;
    };
  }

  // ---------- the dropdown ----------
  var box = null, items = [], ix = -1, forEl = null, timer = null, cfgOf = null;
  var STYLE_ID = 'rtgtype-css';
  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.rtgtype-box{position:fixed; z-index:90; background:var(--card2,#12233c);' +
      ' border:1.5px solid var(--rtgt-accent,#2F6BFF); border-radius:11px;' +
      ' box-shadow:0 18px 40px -14px rgba(0,0,0,.7); overflow:hidden;' +
      ' max-height:min(46vh,290px); overflow-y:auto; -webkit-overflow-scrolling:touch;}' +
      '.rtgtype-box[hidden]{display:none;}' +
      '.rtgtype-item{display:block; width:100%; text-align:left; appearance:none; border:0;' +
      ' cursor:pointer; background:transparent; font-family:inherit; font-size:15px;' +
      ' font-weight:700; color:var(--ink,#EAF1FA); padding:12px 13px; min-height:46px;' +
      ' border-top:1px solid var(--line,rgba(255,255,255,.10));}' +
      '.rtgtype-item:first-child{border-top:0;}' +
      '.rtgtype-item.on,.rtgtype-item:hover{background:color-mix(in srgb, var(--rtgt-accent,#2F6BFF) 18%, var(--card2,#12233c));}' +
      '.rtgtype-item:active{background:color-mix(in srgb, var(--rtgt-accent,#2F6BFF) 28%, var(--card2,#12233c));}';
    document.head.appendChild(s);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
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
    if (!box || box.hidden) return;
    box.hidden = true; items = []; ix = -1;
    if (forEl) forEl.setAttribute('aria-expanded', 'false');
    forEl = null; cfgOf = null;
  }
  function place(el) {
    var r = el.getBoundingClientRect();
    box.style.left = Math.round(r.left) + 'px';
    box.style.width = Math.round(r.width) + 'px';
    // flip above when the on-screen keyboard leaves no room below
    var below = window.innerHeight - r.bottom;
    if (below < 150 && r.top > below) {
      box.style.top = ''; box.style.bottom = Math.round(window.innerHeight - r.top + 6) + 'px';
    } else {
      box.style.bottom = ''; box.style.top = Math.round(r.bottom + 6) + 'px';
    }
  }
  function paint() {
    box.innerHTML = items.map(function (n, i) {
      return '<button type="button" class="rtgtype-item' + (i === ix ? ' on' : '') + '" data-i="' + i + '"' +
             ' role="option" aria-selected="' + (i === ix) + '" tabindex="-1">' + esc(n) + '</button>';
    }).join('');
  }
  function pick(i) {
    if (!forEl || i < 0 || i >= items.length) return;
    var el = forEl, cfg = cfgOf, val = items[i];
    el.value = val;
    close();
    if (cfg && cfg.onPick) cfg.onPick(val, el);
  }
  function onKey(e, cfg) {
    if (box && !box.hidden && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); ix = (ix + 1) % items.length; paint(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); ix = (ix - 1 + items.length) % items.length; paint(); return; }
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Enter' && ix >= 0) { e.preventDefault(); pick(ix); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); close(); if (cfg.onSubmit) cfg.onSubmit(e.target.value, e.target); }
  }
  function mount(el, cfg) {
    if (!el || !cfg || !cfg.source) return;
    injectCSS();
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('spellcheck', 'false');
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-expanded', 'false');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-controls', 'rtgtype-box');
    if (cfg.accent) el.style.setProperty('--rtgt-accent', cfg.accent);
    el.addEventListener('input', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        if (document.activeElement !== el) return;
        var list = cfg.source(el.value, cfg.max || 7) || [];
        if (!list.length) { close(); return; }
        ensureBox();
        if (cfg.accent) box.style.setProperty('--rtgt-accent', cfg.accent);
        items = list; ix = -1; forEl = el; cfgOf = cfg;
        el.setAttribute('aria-expanded', 'true');
        paint(); box.hidden = false; place(el);
      }, 80);
    });
    el.addEventListener('keydown', function (e) { onKey(e, cfg); });
    el.addEventListener('blur', function () { setTimeout(close, 120); });
  }
  // Guard on the method, not on the global: the node test harness defines a
  // bare `window` object to load the corpus files into.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', function () { if (forEl && box && !box.hidden) place(forEl); });
    window.addEventListener('scroll', function () { if (forEl && box && !box.hidden) place(forEl); }, true);
  }

  return {
    mount: mount, close: close,
    norm: norm, tokens: tokens, nameKey: nameKey, hasFullName: hasFullName,
    sameName: sameName, schoolKey: schoolKey, sameCollege: sameCollege,
    playerSource: playerSource, collegeSource: collegeSource
  };
});
