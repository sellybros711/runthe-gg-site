/* 4th and What: the shell every view shares.
 *
 *   FAW_APP.show(view)          one of home, play, studio, learn, books, test, print (also the url hash)
 *   FAW_APP.on(view, fn)        run fn each time that view is shown
 *   FAW_APP.SC                  the situation: down, distance, ballOn (yards to the goal), ballX, roster
 *   FAW_APP.draft               the play in the Studio: { play, name, nameEdited, tag, fav, notes,
 *                               situations, ref: { book, id } | null }, kept in this browser
 *   FAW_APP.store               playbooks on the account (book.js)
 *   FAW_APP.choices()           every play a view can pick: the Studio's, the concepts, the books'
 *   FAW_APP.saveDialog(play, o) save a play into a playbook (signed in) or ask to sign in
 *
 * The page opens on Home (the owner, 2026-10-31: a homepage that points
 * you to your options, to play or to build). The owner's template has five
 * places along the top: Play,
 * Learn, Playbooks, Test vs Defense and Print, plus the Studio where a play
 * is made. Every view reads and writes the same draft, so a play drawn in the
 * Studio is the one Play runs, Test tests and Save saves.
 *
 * Playbooks need a Run The Games account (the owner's call, 2026-10-30). The
 * game, the Studio and the concepts do not.
 *
 * Plain script: window.FAW_APP.
 */
(function () {
  'use strict';
  var C = window.FAW_CONFIG, E = window.FAW_ENGINE, B = window.FAW_BOOK, N = window.FAW_NAMES, R = window.FAW_ROUTES, F = window.FAW_FORMATIONS;
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ['home', 'play', 'studio', 'learn', 'books', 'test', 'print'];
  var hooks = {}, current = null;

  /* ---------- little helpers ---------- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (attrs[k] == null) continue;
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'on') for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function fill(sel, opts, value) {
    sel.innerHTML = '';
    opts.forEach(function (o) {
      if (o.group) { var g = el('optgroup', { label: o.group }); o.items.forEach(function (x) { g.appendChild(el('option', { value: x[0], text: x[1] })); }); sel.appendChild(g); return; }
      sel.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    if (value != null) sel.value = String(value);
    return sel;
  }
  function select(opts, value, on) { var s = el('select', { on: { change: function () { on(s.value); } } }); return fill(s, opts, value); }
  function toast(id, t) { var b = $(id); if (!b) return; b.textContent = t; b.hidden = !t; clearTimeout(b._t); if (t) b._t = setTimeout(function () { b.hidden = true; }, 3600); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  var CALL_LABEL = { cover0: 'Cover 0 blitz', cover1: 'Cover 1 man', cover1b: 'Cover 1 blitz', cover2: 'Cover 2 zone', cover2b: 'Cover 2 blitz', cover3: 'Cover 3 zone', cover3b: 'Cover 3 blitz' };
  function pct(w, n) { return n ? Math.round(w * 100 / n) + '%' : '-'; }

  /* ---------- the situation ---------- */
  var SC = copy(C.SCENARIO); SC.down = 4;
  function ordinal(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : '4th'; }
  function spotText(ballOn) { return ballOn === 50 ? 'Midfield' : ballOn < 50 ? 'Opp ' + ballOn : 'Own ' + (100 - ballOn); }
  function sitText(sc) {
    sc = sc || SC;
    var goal = sc.distance >= sc.ballOn;
    return { down: ordinal(sc.down) + ' & ' + (goal ? 'Goal' : sc.distance), spot: spotText(sc.ballOn) };
  }

  /* ---------- the draft: the play in the Studio ---------- */
  var DRAFT_KEY = 'faw_draft_v2';
  function emptyPlay(f) { return { formation: f || 'gun3x1', moved: {}, routes: [], blocks: [], handoff: null, targets: [] }; }
  var draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { draft = null; }
  if (!draft || !draft.play) {
    draft = { play: R.apply(emptyPlay('gun3x1'), 'Snag'), name: '', nameEdited: false, tag: 'pass', fav: false, notes: '', situations: [], ref: null };
  }
  function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) {} }

  /* ---------- playbooks ---------- */
  var store = B.createStore(function () { fire('remote'); });
  function signedIn() { return !!store.who(); }
  function openStore() { return store.open(); }
  function terms() { return N.clean(store.terms() || N.defaults()); }
  function customOf(book, id) { var f = null; (book && book.formations || []).forEach(function (x) { if (x.id === id) f = x; }); return f; }
  function nameFor(play, book) { var f = customOf(book, play.customFormation); return N.suggest(play, terms(), { formationName: f ? f.name : null }).name; }
  function tagOf(play) { return play.handoff && play.handoff.to ? 'run' : 'pass'; }
  if (window.RTG_AUTH && window.RTG_AUTH.onChange) window.RTG_AUTH.onChange(function (s) { if (s && s.resolved) openStore().then(function () { fire('remote'); }); });

  /* Every play a view can pick, as { key, label, group, play, distance, entry, book }. */
  function choices() {
    var out = [{ key: 'draft', label: (draft.name || nameFor(draft.play)) + ' (Studio)', group: 'Your play', play: draft.play }];
    R.CONCEPTS.forEach(function (c) {
      out.push({ key: 'c:' + c.name, label: c.name, group: c.kind === 'run' ? 'Run concepts' : 'Pass concepts', play: R.apply(emptyPlay(c.kind === 'run' ? 'iform' : 'gun3x1'), c.name) });
    });
    if (signedIn() && store.ready()) store.books().forEach(function (b) {
      b.plays.forEach(function (p) { out.push({ key: 'b:' + b.id + ':' + p.id, label: p.name, group: b.name, play: p.play, distance: p.distance, entry: p, book: b }); });
    });
    return out;
  }
  function choiceOptions(list) {
    var groups = [], by = {};
    list.forEach(function (c) { if (!by[c.group]) { by[c.group] = { group: c.group, items: [] }; groups.push(by[c.group]); } by[c.group].items.push([c.key, c.label]); });
    return groups;
  }
  function choice(key) { var l = choices(); for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i]; return l[0]; }

  /* ---------- the views ---------- */
  function show(v) {
    if (VIEWS.indexOf(v) < 0) v = 'home';
    current = v;
    VIEWS.forEach(function (x) { var s = $('v' + x.charAt(0).toUpperCase() + x.slice(1)); if (s) s.hidden = x !== v; });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { if (t.dataset.view === v) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    (hooks[v] || []).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    window.scrollTo(0, 0);
  }
  function on(v, fn) { (hooks[v] = hooks[v] || []).push(fn); }
  function fire(k) { (hooks[k] || []).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); if (k === 'remote' && current) (hooks[current] || []).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.addEventListener('click', function () { show(t.dataset.view); }); });
  document.querySelector('.logo').addEventListener('click', function (ev) { ev.preventDefault(); show('home'); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) { b.addEventListener('click', function () { show(b.dataset.go); }); });
  window.addEventListener('hashchange', function () { var v = location.hash.slice(1); if (v !== current) show(v); });

  /* ---------- save a play into a playbook ---------- */
  function saveDialog(play, o) {
    o = o || {};
    var dlg = $('saveDlg'), out = $('saveOut'); out.innerHTML = '';
    var sug = nameFor(play), card = el('figure', { class: 'savecard' }), cap = el('figcaption', { text: o.name || sug });
    card.appendChild(window.FAW_TURF.thumb(play, 420, 260, { distance: o.distance || SC.distance })); card.appendChild(cap); out.appendChild(card);
    if (!signedIn()) {
      out.appendChild(el('p', { class: 'help', text: 'Playbooks live on your Run The Games account. Sign in, then save it.' }));
      out.appendChild(el('button', { type: 'button', class: 'btn gold', text: 'Sign in', on: { click: function () { dlg.close(); if (window.RTGAuthUI) window.RTGAuthUI.open(); } } }));
      $('bSaveOk').hidden = true; dlg.showModal(); return;
    }
    $('bSaveOk').hidden = false;
    openStore().then(function () {
      var books = store.books(), bookSel, secSel, nameIn;
      function secs() {
        var b = store.book(bookSel.value);
        fill(secSel, (b ? b.sections : [{ id: '', name: 'Plays' }]).map(function (s) { return [s.id, s.name]; }));
      }
      bookSel = select(books.map(function (b) { return [b.id, b.name]; }).concat([['__new', 'A new playbook']]), books[0] ? books[0].id : '__new', secs);
      secSel = el('select');
      nameIn = el('input', { maxlength: '80', value: o.name || sug });
      nameIn.addEventListener('input', function () { cap.textContent = nameIn.value.trim() || sug; });
      out.appendChild(el('label', { class: 'field' }, [el('span', { text: 'Playbook' }), bookSel]));
      out.appendChild(el('label', { class: 'field' }, [el('span', { text: 'Section' }), secSel]));
      out.appendChild(el('label', { class: 'field' }, [el('span', { text: 'Name (from your terminology)' }), nameIn]));
      secs();
      $('bSaveOk').onclick = function () {
        var b = bookSel.value === '__new' ? store.put(B.newBook('My playbook')) : store.book(bookSel.value);
        var nm = nameIn.value.trim() || sug;
        var e = B.newPlay(b, play, { section: secSel.value || b.sections[0].id, distance: o.distance || SC.distance, name: nm, nameEdited: nm !== sug });
        if (o.tag) e.tag = o.tag; if (o.fav) e.fav = true; if (o.notes) e.notes = o.notes; if (o.situations) e.situations = o.situations.slice();
        b.plays.push(e); store.put(b); dlg.close();
        if (o.done) o.done(b, e);
      };
      dlg.showModal();
    });
  }
  $('bSaveCancel').addEventListener('click', function () { $('saveDlg').close(); });

  /* ---------- the shell ---------- */
  $('bGuide').addEventListener('click', function () { var g = $('guide'); if (g.showModal) g.showModal(); else g.setAttribute('open', ''); });
  $('themeBtn').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('runthegrid_theme', next); } catch (e) {}
    var m = $('themeMeta'); if (m) m.setAttribute('content', next === 'dark' ? '#0b1522' : '#eef2f6');
  });
  window.addEventListener('faw-pxhd', function () { if (window.FAW_RIG) window.FAW_RIG.init(window.FAW_PXHD); });
  if (window.FAW_PXHD && window.FAW_RIG) window.FAW_RIG.init(window.FAW_PXHD);

  /* ---------- watch it in 3D ---------- */
  var live = null;
  function watch3d(res) {
    var w = $('watch'); w.hidden = false; $('cap').textContent = ''; $('bSkip').hidden = false;
    if (live) live.stop();
    window.FAW_LIVE.prepare(res.BX, res.Y0);
    live = window.FAW_LIVE.show($('cLive'), res, {
      caption: function (t) { $('cap').textContent = t; },
      pressure: function (p) { $('pressFill').style.width = Math.round(p * 100) + '%'; $('press').style.opacity = res.isRun ? '0' : '1'; },
      done: function () { $('bSkip').hidden = true; }
    });
  }
  $('bSkip').addEventListener('click', function () { live && live.skip(); });
  $('bClose3d').addEventListener('click', function () { if (live) live.stop(); $('watch').hidden = true; });

  window.FAW_APP = {
    el: el, fill: fill, select: select, toast: toast, copy: copy, pct: pct, CALL_LABEL: CALL_LABEL,
    SC: SC, sitText: sitText, spotText: spotText, ordinal: ordinal,
    get draft() { return draft; }, setDraft: function (d) { draft = d; saveDraft(); }, saveDraft: saveDraft, emptyPlay: emptyPlay,
    store: store, signedIn: signedIn, openStore: openStore, terms: terms, nameFor: nameFor, tagOf: tagOf, customOf: customOf,
    choices: choices, choiceOptions: choiceOptions, choice: choice,
    show: show, on: on, fire: fire, current: function () { return current; },
    saveDialog: saveDialog, watch3d: watch3d
  };
  /* the views register themselves after this file; the first view is shown once they have */
  window.addEventListener('DOMContentLoaded', function () { show(location.hash.slice(1) || 'home'); });
})();
