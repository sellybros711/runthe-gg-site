/* 4th and What: the playbook screens.
 *
 *   My Playbooks    the account's playbooks (sign in first), new, import a file, My terminology
 *   one playbook    its sections and plays, each with a small diagram and how it has done;
 *                   reorder, move between sections, copy, delete, print or export
 *   a play          the clipboard (ui.js, 'edit' mode) with its name, section and notes;
 *                   Save, Test vs every defense, the defense to snap against, Save this formation
 *   My terminology  the coach's words: the naming style, the name order, formation words,
 *                   route words, concept words and run words, with a live example
 *   Print or export every option export.js has, with a live preview
 *
 * Playbooks need a Run The Games account (the owner's call, 2026-10-30);
 * book.js keeps them. Names come from names.js; diagrams from diagram.js.
 *
 * Plain script, no exports beyond window.FAW_BOOKUI for the checks.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var B = window.FAW_BOOK, N = window.FAW_NAMES, E = window.FAW_ENGINE, C = window.FAW_CONFIG, X = window.FAW_EXPORT, UI = window.FAW_UI;
  var store = B.createStore(function () { rerender(); toast('Updated from your other device.'); });
  var cur = { book: null, entry: null }, saveTimer = 0, termsTimer = 0, previewTimer = 0;
  var TEST_SNAPS = 40;

  /* ---------- little helpers ---------- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'on') for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function select(opts, value, on) {
    var s = el('select', { on: { change: function () { on(s.value); } } });
    opts.forEach(function (o) { var x = el('option', { value: o[0], text: o[1] }); if (String(o[0]) === String(value)) x.selected = true; s.appendChild(x); });
    return s;
  }
  function toast(t) { var b = $('boardToast'); if (!b) return; b.textContent = t; b.hidden = false; clearTimeout(b._t); b._t = setTimeout(function () { b.hidden = true; }, 3200); }
  function terms() { return N.clean(store.terms() || N.defaults()); }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(); } catch (e) { return ''; } }
  function custom(book, id) { var f = null; (book && book.formations || []).forEach(function (x) { if (x.id === id) f = x; }); return f; }
  function nameFor(play, book) { var f = custom(book, play.customFormation); return N.suggest(play, terms(), { formationName: f ? f.name : null }).name; }
  function thumb(play, w, h) {
    var c = el('canvas', { class: 'thumb', width: w * 2, height: h * 2 }); c.style.width = w + 'px'; c.style.height = h + 'px';
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w * 2, h * 2);
    window.FAW_DIAGRAM.draw(x, 4, 4, w * 2 - 8, h * 2 - 8, play, { color: true });
    return c;
  }
  var CALL_LABEL = { cover0: 'Cover 0, all out blitz', cover1: 'Cover 1 man', cover1b: 'Cover 1 man, blitz', cover2: 'Cover 2 zone', cover2b: 'Cover 2 zone, blitz', cover3: 'Cover 3 zone', cover3b: 'Cover 3 zone, blitz' };
  function pct(w, n) { return n ? Math.round(w * 100 / n) + '%' : '-'; }

  /* ---------- signing in ---------- */
  function signedIn() { return !!store.who(); }
  function openStore() { return store.open(); }
  if (window.RTG_AUTH && window.RTG_AUTH.onChange) window.RTG_AUTH.onChange(function (s) { if (s && s.resolved) openStore().then(rerender); });
  $('bSignin').addEventListener('click', function () { if (window.RTGAuthUI && window.RTGAuthUI.open) window.RTGAuthUI.open(); });

  /* ---------- My Playbooks ---------- */
  function renderBooks() {
    var out = $('booksOut'); out.innerHTML = '';
    var inn = signedIn();
    $('booksSignin').hidden = inn; $('booksActs').hidden = !inn;
    if (!inn) return;
    if (!store.ready()) { out.appendChild(el('p', { class: 'lede', text: 'Opening your playbooks.' })); openStore().then(renderBooks); return; }
    var list = store.books();
    if (!list.length) out.appendChild(el('p', { class: 'lede', text: 'No playbooks yet. Start one, or save a play from Build a Play.' }));
    list.forEach(function (b) {
      out.appendChild(el('button', { type: 'button', class: 'bookcard', 'data-book': b.id, on: { click: function () { openBook(b.id); } } }, [
        el('b', { text: b.name }), el('span', { text: b.plays.length + (b.plays.length === 1 ? ' play' : ' plays') + ' · ' + fmtDate(b.updated) })
      ]));
    });
  }
  $('bNewBook').addEventListener('click', function () {
    var b = store.put(B.newBook('My playbook'));
    openBook(b.id); setTimeout(function () { $('bookName').focus(); $('bookName').select(); }, 50);
  });
  $('bTerms').addEventListener('click', function () { UI.show('sTerms'); });
  $('bImport').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = ''; if (!f) return;
    f.text().then(function (t) {
      var r = B.importFile(t);
      store.put(r.book);
      if (r.terms && window.confirm('This file has its own terminology. Use it for your plays?')) store.setTerms(r.terms);
      openBook(r.book.id);
    }).catch(function (e) { window.alert(e && e.message ? e.message : 'That file could not be read.'); });
  });

  /* ---------- one playbook ---------- */
  function openBook(id) { cur.book = store.book(id); cur.entry = null; UI.show('sBook'); }
  function saveBook() { if (cur.book) store.put(cur.book); }
  function renderBook() {
    var b = cur.book; if (!b) return UI.show('sBooks');
    $('bookName').value = b.name; $('bookTeam').value = b.team || '';
    var out = $('bookOut'); out.innerHTML = '';
    b.sections.forEach(function (s, si) {
      var plays = b.plays.filter(function (p) { return p.section === s.id; });
      var head = el('div', { class: 'sechead' }, [
        el('input', { class: 'secname', value: s.name, maxlength: '40', 'aria-label': 'Section name', on: { change: function () { s.name = this.value.trim() || 'Plays'; saveBook(); } } }),
        el('button', { type: 'button', class: 'mini', text: 'Up', 'aria-label': 'Move section up', on: { click: function () { if (si > 0) { b.sections.splice(si - 1, 0, b.sections.splice(si, 1)[0]); saveBook(); renderBook(); } } } }),
        el('button', { type: 'button', class: 'mini', text: 'Add play', on: { click: function () { newPlay(s.id); } } }),
        b.sections.length > 1 ? el('button', { type: 'button', class: 'mini', text: 'Remove', on: { click: function () {
          if (plays.length && !window.confirm('Move its ' + plays.length + ' plays to the first section and remove "' + s.name + '"?')) return;
          b.sections.splice(si, 1); var to = b.sections[0].id; b.plays.forEach(function (p) { if (p.section === s.id) p.section = to; }); saveBook(); renderBook();
        } } }) : null
      ]);
      out.appendChild(head);
      if (!plays.length) out.appendChild(el('p', { class: 'empty', text: 'No plays here yet.' }));
      plays.forEach(function (p) {
        var i = b.plays.indexOf(p);
        var st = p.stats && p.stats[p.distance], line = '4th and ' + p.distance;
        var sl = X.statLine(p); if (sl) line += ' · ' + sl;
        out.appendChild(el('div', { class: 'playrow', 'data-play': p.id }, [
          el('button', { type: 'button', class: 'playopen', on: { click: function () { editPlay(p.id); } } }, [thumb(p.play, 96, 72), el('span', { class: 'pinfo' }, [el('b', { text: p.name }), el('small', { text: line })])]),
          el('div', { class: 'pacts' }, [
            el('button', { type: 'button', class: 'mini', text: 'Up', 'aria-label': 'Move up', on: { click: function () {
              var prev = -1; for (var k = i - 1; k >= 0; k--) if (b.plays[k].section === p.section) { prev = k; break; }
              if (prev >= 0) { b.plays.splice(i, 1); b.plays.splice(prev, 0, p); saveBook(); renderBook(); }
            } } }),
            select(b.sections.map(function (x) { return [x.id, x.name]; }), p.section, function (v) { p.section = v; saveBook(); renderBook(); }),
            el('button', { type: 'button', class: 'mini', text: 'Copy', on: { click: function () {
              var c = JSON.parse(JSON.stringify(p)); c.id = B.newId(); c.name = p.name + ' 2'; c.nameEdited = true; c.stats = {}; b.plays.splice(i + 1, 0, c); saveBook(); renderBook();
            } } }),
            el('button', { type: 'button', class: 'mini', text: 'Delete', on: { click: function () { if (window.confirm('Delete "' + p.name + '"?')) { b.plays.splice(i, 1); saveBook(); renderBook(); } } } })
          ])
        ]));
      });
    });
  }
  $('bookName').addEventListener('change', function () { if (cur.book) { cur.book.name = this.value.trim() || 'My playbook'; saveBook(); } });
  $('bookTeam').addEventListener('change', function () { if (cur.book) { cur.book.team = this.value.trim(); saveBook(); } });
  $('bNewSection').addEventListener('click', function () { if (!cur.book) return; cur.book.sections.push({ id: B.newId(), name: 'New section' }); saveBook(); renderBook(); });
  $('bNewPlay').addEventListener('click', function () { newPlay(null); });
  $('bExport').addEventListener('click', function () { UI.show('sExport'); });
  $('bBookFile').addEventListener('click', function () { if (cur.book) X.downloadText(B.exportFile(cur.book, store.terms()), X.slug(cur.book.name) + '.4th-and-what.json'); });
  $('bDelBook').addEventListener('click', function () {
    if (!cur.book || !window.confirm('Delete "' + cur.book.name + '" and its ' + cur.book.plays.length + ' plays? This cannot be undone.')) return;
    store.remove(cur.book.id); cur.book = null; UI.show('sBooks');
  });

  /* ---------- a play ---------- */
  function newPlay(sectionId) {
    var b = cur.book; if (!b) return;
    if (b.plays.length >= B.MAX_PLAYS) { window.alert('A playbook holds ' + B.MAX_PLAYS + ' plays. Start another.'); return; }
    var e = B.newPlay(b, window.FAW_BOARD.emptyPlay('gun3x1'), { section: sectionId || b.sections[0].id, distance: 5 });
    e.name = nameFor(e.play, b);
    b.plays.push(e); saveBook(); editPlay(e.id);
  }
  function editPlay(id) {
    var b = cur.book, e = null; b.plays.forEach(function (p) { if (p.id === id) e = p; });
    if (!e) return;
    cur.entry = e;
    UI.setMode('edit');
    UI.formChips(b.formations || []);
    $('bookTag').textContent = b.name;
    $('pName').value = e.name; $('pNotes').value = e.notes || '';
    var sec = $('pSection'); sec.innerHTML = '';
    b.sections.forEach(function (s) { var o = el('option', { value: s.id, text: s.name }); if (s.id === e.section) o.selected = true; sec.appendChild(o); });
    UI.open(e.play, e.distance);
    renderTests();
  }
  function autosave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveEntry, 700); }
  function saveEntry() {
    clearTimeout(saveTimer);
    var e = cur.entry; if (!e || UI.mode() !== 'edit') return;
    e.play = UI.board().play(); e.updated = new Date().toISOString();
    saveBook();
  }
  UI.hook('changed', function (play) {
    if (UI.mode() !== 'edit' || !cur.entry) return;
    var sug = nameFor(play, cur.book);
    $('pSuggest').textContent = cur.entry.nameEdited ? 'Suggested: ' + sug + '. Tap to use it.' : 'Named from your terminology.';
    $('pSuggest').dataset.sug = sug;
    if (!cur.entry.nameEdited && cur.entry.name !== sug) { cur.entry.name = sug; $('pName').value = sug; autosave(); }
    /* opening a play is not an edit: only a changed drawing saves */
    if (JSON.stringify(play) !== JSON.stringify(cur.entry.play)) autosave();
  });
  $('pSuggest').addEventListener('click', function () { var e = cur.entry; if (!e || !e.nameEdited) return; e.nameEdited = false; e.name = this.dataset.sug; $('pName').value = e.name; this.textContent = 'Named from your terminology.'; autosave(); });
  $('pName').addEventListener('input', function () { var e = cur.entry; if (!e) return; e.name = this.value.trim() || 'Play'; e.nameEdited = true; $('pSuggest').textContent = 'Suggested: ' + $('pSuggest').dataset.sug + '. Tap to use it.'; autosave(); });
  $('pNotes').addEventListener('input', function () { if (cur.entry) { cur.entry.notes = this.value; autosave(); } });
  $('pSection').addEventListener('change', function () { if (cur.entry) { cur.entry.section = this.value; autosave(); } });
  $('bSavePlay').addEventListener('click', function () { saveEntry(); toast('Saved to ' + cur.book.name + '.'); });
  $('bToBook').addEventListener('click', function () { saveEntry(); UI.setMode('build'); cur.entry = null; UI.show('sBook'); });
  UI.hook('distance', function (d) { if (UI.mode() === 'edit' && cur.entry) { cur.entry.distance = d; autosave(); renderTests(); } });
  UI.hook('name', function () { return cur.entry ? cur.entry.name : 'play'; });
  UI.hook('terms', terms);
  /* a watched snap counts against whatever the defense called */
  UI.hook('snapped', function (r) {
    if (!cur.entry) return;
    B.countSnap(cur.entry, r.distance, r.callKey, r.win);
    saveBook(); renderTests();
  });
  (function () {
    var s = $('defSel'); s.appendChild(el('option', { value: 'random', text: 'Random defense' }));
    E.CALL_KEYS.forEach(function (k) { s.appendChild(el('option', { value: k, text: CALL_LABEL[k] })); });
  })();
  $('bSaveForm').addEventListener('click', function () {
    var b = cur.book; if (!b) return;
    var p = UI.board().play(), name = window.prompt('Name this formation (your players where they stand now).', 'Bunch Right');
    if (!name) return;
    var f = { id: B.newId(), name: name.trim().slice(0, 30), base: p.formation, moved: JSON.parse(JSON.stringify(p.moved || {})) };
    b.formations = b.formations || []; b.formations.push(f);
    saveBook(); UI.formChips(b.formations);
    var np = UI.board().play(); np.customFormation = f.id; UI.board().setPlay(np);
    toast('Saved "' + f.name + '". It is in the formation list for every play in this book.');
  });

  /* ---------- Test it: every defense, many snaps, no picture ---------- */
  function playKey(p) { return JSON.stringify([p.formation, p.moved, p.routes, p.blocks, p.handoff, p.targets]); }
  $('bTest').addEventListener('click', function () {
    var e = cur.entry; if (!e) return;
    var play = UI.board().play();
    if (!(play.handoff && play.handoff.to) && !(play.targets && play.targets.length)) { toast('Give it a Target or a Handoff first.'); return; }
    var sc = JSON.parse(JSON.stringify(UI.scenario)); sc.distance = e.distance;
    var keys = E.CALL_KEYS.slice(), res = {}, k = 0, s = 1;
    var panel = $('testPanel'); panel.hidden = false; panel.textContent = 'Testing against every defense.';
    $('bTest').disabled = true;
    (function step() {
      var t0 = Date.now();
      while (k < keys.length && Date.now() - t0 < 40) {
        var key = keys[k], r = E.run(sc, play, s * 7919, { call: key });
        var o = res[key] = res[key] || { n: 0, w: 0, yds: 0 }; o.n++; if (r.win) o.w++; o.yds += r.yards;
        if (++s > TEST_SNAPS) { s = 1; k++; }
      }
      if (k < keys.length) { panel.textContent = 'Testing against every defense. ' + Math.round(k * 100 / keys.length) + '%'; setTimeout(step, 0); return; }
      var st = e.stats[e.distance] = e.stats[e.distance] || {};
      res.at = new Date().toISOString(); res.key = playKey(play);
      st.test = res; e.play = play; saveBook(); $('bTest').disabled = false; renderTests();
    })();
  });
  function renderTests() {
    var e = cur.entry, panel = $('testPanel'); if (!e) { panel.hidden = true; return; }
    var st = e.stats && e.stats[e.distance];
    if (!st || (!st.test && !st.byCall)) { panel.hidden = true; return; }
    panel.hidden = false; panel.innerHTML = '';
    var t = st.test, live = st.byCall || {}, stale = t && t.key && t.key !== playKey(UI.board().play());
    panel.appendChild(el('p', { class: 'testh', text: '4th and ' + e.distance + (t ? ': tested ' + TEST_SNAPS + ' snaps against each defense' : '') }));
    var tbl = el('table', { class: 'testt' }, [el('tr', {}, [el('th', { text: 'Defense' }), el('th', { text: 'Tested' }), el('th', { text: 'Avg yds' }), el('th', { text: 'Your snaps' })])]);
    var tn = 0, tw = 0;
    E.CALL_KEYS.forEach(function (k) {
      var a = t && t[k], l = live[k];
      if (a) { tn += a.n; tw += a.w; }
      tbl.appendChild(el('tr', {}, [el('td', { text: CALL_LABEL[k] }), el('td', { text: a ? pct(a.w, a.n) : '-' }),
        el('td', { text: a ? (a.yds / a.n).toFixed(1) : '-' }), el('td', { text: l ? l.w + ' of ' + l.n : '-' })]));
    });
    var lt = B.totals(live);
    tbl.appendChild(el('tr', { class: 'tot' }, [el('td', { text: 'Every defense' }), el('td', { text: tn ? pct(tw, tn) : '-' }), el('td', { text: '' }), el('td', { text: lt.n ? lt.w + ' of ' + lt.n : '-' })]));
    panel.appendChild(tbl);
    if (stale) panel.appendChild(el('p', { class: 'stale', text: 'The play has changed since this test. Test it again.' }));
  }

  /* ---------- save a drawn play into a playbook ---------- */
  UI.hook('saveTo', function (play, distance) {
    var dlg = $('saveDlg'), out = $('saveOut'); out.innerHTML = '';
    /* the play stays in sight while it is saved: the card it will make */
    var card = el('figure', { class: 'savecard' }), cap = el('figcaption', { text: N.suggest(play, terms()).name });
    var cv = el('canvas', { width: '760', height: '520' }), cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, 760, 520);
    window.FAW_DIAGRAM.draw(cx, 8, 8, 744, 504, play, { color: true, defense: true, distance: distance, field: true, gain: true, letters: true, reads: true });
    card.appendChild(cv); card.appendChild(cap); out.appendChild(card);
    if (!signedIn()) {
      out.appendChild(el('p', { text: 'Playbooks live on your Run The Games account. Sign in, then save it.' }));
      out.appendChild(el('button', { type: 'button', class: 'btn go', text: 'Sign in', on: { click: function () { dlg.close(); if (window.RTGAuthUI) window.RTGAuthUI.open(); } } }));
      $('bSaveOk').hidden = true; dlg.showModal(); return;
    }
    $('bSaveOk').hidden = false;
    openStore().then(function () {
      var books = store.books(), bookSel, secSel, nameIn;
      function secs() {
        secSel.innerHTML = '';
        var b = store.book(bookSel.value);
        (b ? b.sections : [{ id: '', name: 'Plays' }]).forEach(function (s) { secSel.appendChild(el('option', { value: s.id, text: s.name })); });
      }
      bookSel = select(books.map(function (b) { return [b.id, b.name]; }).concat([['__new', 'A new playbook']]), books[0] ? books[0].id : '__new', secs);
      secSel = el('select');
      nameIn = el('input', { maxlength: '80', value: N.suggest(play, terms()).name });
      cap.textContent = nameIn.value;
      nameIn.addEventListener('input', function () { cap.textContent = nameIn.value.trim() || N.suggest(play, terms()).name; });
      out.appendChild(el('label', { class: 'field' }, [el('span', { text: 'Playbook' }), bookSel]));
      out.appendChild(el('label', { class: 'field' }, [el('span', { text: 'Section' }), secSel]));
      out.appendChild(el('label', { class: 'field' }, [el('span', { text: 'Name (from your terminology)' }), nameIn]));
      secs();
      $('bSaveOk').onclick = function () {
        var b = bookSel.value === '__new' ? store.put(B.newBook('My playbook')) : store.book(bookSel.value);
        var sug = N.suggest(play, terms()).name, nm = nameIn.value.trim() || sug;
        var e = B.newPlay(b, play, { section: secSel.value || b.sections[0].id, distance: distance, name: nm, nameEdited: nm !== sug });
        b.plays.push(e); store.put(b); dlg.close();
        toast('Saved to ' + b.name + '.');
        var t = $('toast'); if (t) { t.textContent = 'Saved to ' + b.name + '.'; t.hidden = false; }
      };
      dlg.showModal();
    });
  });
  $('bSaveCancel').addEventListener('click', function () { $('saveDlg').close(); });

  /* ---------- My terminology ---------- */
  var SIDES = [['any', 'Anywhere'], ['left', 'On the left'], ['right', 'On the right'], ['strong', 'To the strength'], ['weak', 'Away from it']];
  var WHOS = [['any', 'Any player'], ['X', 'The X'], ['Z', 'The Z'], ['H', 'The H'], ['Y', 'The Y'], ['R', 'The R']];
  var TYPES = N.ROUTE_TYPES.map(function (t) { return [t, N.ROUTE_LABEL[t]]; });
  var ORDERS = [['formation side play', 'Formation, side, play (Trips Right Seminole)'], ['play formation side', 'Play, formation, side (Seminole Trips Right)'],
    ['formation play', 'Formation, play (Trips Seminole)'], ['play', 'The play only (Seminole)']];
  var SAMPLE = { formation: 'gun3x1', moved: {}, routes: [{ who: 'WR1', pts: [[-13.5, 1.5], [-9.5, 5.5]] }, { who: 'SLOT', pts: [[-9.5, 1], [-13.5, 3]] }, { who: 'TE', pts: [[-6.2, 6], [-6, 5]] }, { who: 'WR2', pts: [[13.5, 12], [12.5, 10]] }], blocks: [{ who: 'RB', to: [2, -4] }], handoff: null, targets: ['WR1', 'SLOT'] };
  function setTerms(t) {
    store.setTerms(t);
    clearTimeout(termsTimer);
    termsTimer = setTimeout(function () {
      /* a play whose name was never typed by hand follows the new words */
      store.books().forEach(function (b) {
        var changed = false;
        b.plays.forEach(function (p) { if (!p.nameEdited) { var n = nameFor(p.play, b); if (n !== p.name) { p.name = n; changed = true; } } });
        if (changed) store.put(b);
      });
    }, 600);
    renderExample();
  }
  function renderExample() {
    var box = $('termsExample'); box.innerHTML = '';
    box.appendChild(thumb(SAMPLE, 150, 100));
    box.appendChild(el('div', {}, [el('small', { text: 'This play is named' }), el('b', { text: N.suggest(SAMPLE, terms()).name })]));
  }
  function renderTerms() {
    if (!signedIn()) { UI.show('sBooks'); return; }
    if (!store.ready()) { openStore().then(renderTerms); return; }
    var t = terms(), out = $('termsOut'); out.innerHTML = '';
    renderExample();
    function save() { setTerms(t); }
    function group(title, help, body) { out.appendChild(el('section', { class: 'tgroup' }, [el('h3', { text: title }), help ? el('p', { class: 'help', text: help }) : null].concat(body))); }
    group('Naming style', 'Used for any route you have not given a word.', [
      select([['words', 'Route words (Slant Flat)'], ['tree', 'Route tree numbers (21)']], t.preset, function (v) { t.preset = v; save(); }),
      el('label', { class: 'field' }, [el('span', { text: 'Name order' }), select(ORDERS, t.pattern.join(' '), function (v) { t.pattern = v.split(' '); save(); })])
    ]);
    group('Formation words', null, window.FAW_FORMATIONS.SETS.map(function (s) {
      return el('label', { class: 'field half' }, [el('span', { text: s.name }), el('input', { maxlength: '24', value: t.formations[s.id] || '', placeholder: N.FORMATION_WORD[s.id], on: { input: function () { if (this.value.trim()) t.formations[s.id] = this.value.trim(); else delete t.formations[s.id]; save(); } } })]);
    }));
    function rules(list, title, help, blank, fields) {
      var body = [];
      list.forEach(function (r, i) {
        var row = el('div', { class: 'rule' });
        fields(r).forEach(function (f) { row.appendChild(f); });
        row.appendChild(el('input', { class: 'word', maxlength: '24', value: r.word || '', placeholder: 'Your word', 'aria-label': 'Word', on: { input: function () { r.word = this.value.trim(); save(); } } }));
        row.appendChild(el('button', { type: 'button', class: 'mini', text: 'Remove', on: { click: function () { list.splice(i, 1); save(); renderTerms(); } } }));
        body.push(row);
      });
      body.push(el('button', { type: 'button', class: 'btn', text: 'Add', on: { click: function () { list.push(blank()); save(); renderTerms(); } } }));
      group(title, help, body);
    }
    rules(t.routes, 'Route words', 'A route, where it is run, and your word for it. The most exact rule wins: a player beats a side, a side beats anywhere.',
      function () { return { type: 'slant', side: 'left', who: 'any', word: '' }; },
      function (r) { return [select(TYPES, r.type, function (v) { r.type = v; save(); }), select(SIDES, r.side || 'any', function (v) { r.side = v; save(); }), select(WHOS, r.who || 'any', function (v) { r.who = v; save(); })]; });
    rules(t.concepts, 'Concept words', 'Two or three routes on the same side, named together. A concept is used before single route words.',
      function () { return { types: ['slant', 'flat'], side: 'any', word: '' }; },
      function (r) {
        var third = [['', 'and nothing else']].concat(TYPES);
        return [select(TYPES, r.types[0], function (v) { r.types[0] = v; save(); }), select(TYPES, r.types[1], function (v) { r.types[1] = v; save(); }),
          select(third, r.types[2] || '', function (v) { if (v) r.types[2] = v; else r.types.length = 2; save(); }), select(SIDES, r.side || 'any', function (v) { r.side = v; save(); })];
      });
    rules(t.runs, 'Run words', 'A handoff, which way it goes and whether someone leads, and your word for it.',
      function () { return { carrier: 'any', dir: 'any', side: 'any', lead: 'any', word: '' }; },
      function (r) {
        return [select([['any', 'Any carrier'], ['R', 'The R'], ['Q', 'QB keeps it'], ['Y', 'The Y'], ['H', 'The H']], r.carrier || 'any', function (v) { r.carrier = v; save(); }),
          select([['any', 'Inside or out'], ['inside', 'Inside'], ['outside', 'Outside']], r.dir || 'any', function (v) { r.dir = v; save(); }),
          select([['any', 'Either way'], ['left', 'To the left'], ['right', 'To the right'], ['middle', 'Straight ahead']], r.side || 'any', function (v) { r.side = v; save(); }),
          select([['any', 'Lead block or not'], ['yes', 'With a lead block'], ['no', 'No lead block']], r.lead || 'any', function (v) { r.lead = v; save(); })];
      });
  }

  /* ---------- Print or export ---------- */
  function exportOpt() { var b = cur.book; b.exportOpt = X.withDefaults(b.exportOpt || {}); return b.exportOpt; }
  function renderExport() {
    var b = cur.book; if (!b) return UI.show('sBooks');
    var o = exportOpt(), out = $('exportOut'); out.innerHTML = '';
    function set(k, v) { o[k] = v; saveBook(); schedulePreview(); }
    function chk(k, label) { var i = el('input', { type: 'checkbox' }); i.checked = !!o[k]; i.addEventListener('change', function () { set(k, i.checked); if (k === 'landscape') renderExport(); }); return el('label', { class: 'chk' }, [i, label]); }
    function num(k, label, min, max, step) { return el('label', { class: 'field half' }, [el('span', { text: label }), el('input', { type: 'number', min: String(min), max: String(max), step: String(step || 1), value: String(o[k]), on: { change: function () { var v = +this.value; if (v >= min && v <= max) set(k, v); } } })]); }
    function sel(k, label, opts, rerender) { return el('label', { class: 'field half' }, [el('span', { text: label }), select(opts, o[k], function (v) { set(k, isNaN(+v) || v === '' ? v : +v); if (rerender) renderExport(); })]); }
    function text(k, label, ph) { return el('label', { class: 'field half' }, [el('span', { text: label }), el('input', { maxlength: '60', value: o[k] || '', placeholder: ph || '', on: { input: function () { set(k, this.value); } } })]); }
    function group(title, kids) { out.appendChild(el('section', { class: 'tgroup' }, [el('h3', { text: title })].concat(kids))); }

    var which = [sel('plays', 'Plays', [['all', 'Every play'], ['sections', 'Some sections'], ['chosen', 'Plays I pick']], true)];
    if (o.plays === 'sections') b.sections.forEach(function (s) {
      var i = el('input', { type: 'checkbox' }); i.checked = o.sections.indexOf(s.id) >= 0;
      i.addEventListener('change', function () { o.sections = o.sections.filter(function (x) { return x !== s.id; }); if (i.checked) o.sections.push(s.id); set('sections', o.sections); });
      which.push(el('label', { class: 'chk' }, [i, s.name]));
    });
    if (o.plays === 'chosen') b.plays.forEach(function (p) {
      var i = el('input', { type: 'checkbox' }); i.checked = o.chosen.indexOf(p.id) >= 0;
      i.addEventListener('change', function () { o.chosen = o.chosen.filter(function (x) { return x !== p.id; }); if (i.checked) o.chosen.push(p.id); set('chosen', o.chosen); });
      which.push(el('label', { class: 'chk' }, [i, p.name]));
    });
    which.push(sel('order', 'Order', [['book', 'Playbook order'], ['section', 'By section'], ['name', 'By name']]));
    which.push(sel('numbering', 'Numbers', [['continuous', '1, 2, 3'], ['section', 'By section: 101, 201'], ['none', 'No numbers']]));
    which.push(num('startAt', 'Start at', 0, 999));
    group('Which plays', which);

    var lay = [sel('layout', 'Layout', [['cards', 'Play cards'], ['callsheet', 'Call sheet'], ['wristband', 'Wristband cards']], true)];
    if (o.layout === 'cards') lay.push(sel('perPage', 'Plays a page', Object.keys(X.GRID).map(function (k) { return [k, k]; })));
    if (o.layout === 'callsheet') { lay.push(sel('callColumns', 'Columns', [[1, '1'], [2, '2'], [3, '3'], [4, '4']])); lay.push(chk('callThumbs', 'Small diagrams')); }
    if (o.layout === 'wristband') {
      lay.push(num('bandW', 'Card width (in)', 1, 11, 0.25)); lay.push(num('bandH', 'Card height (in)', 1, 11, 0.25));
      lay.push(num('bandCols', 'Columns', 1, 8)); lay.push(num('bandRows', 'Rows', 1, 8));
      lay.push(num('bandCopies', 'Copies of each', 1, 10));
      lay.push(chk('bandText', 'Names only, no diagrams')); lay.push(chk('cutLines', 'Cut lines'));
    }
    group('Layout', lay);

    group('Paper', [sel('paper', 'Size', [['letter', 'Letter'], ['legal', 'Legal'], ['tabloid', 'Tabloid'], ['a4', 'A4'], ['a5', 'A5']]),
      sel('margin', 'Margin', [[0.25, 'Narrow'], [0.4, 'Normal'], [0.6, 'Wide']]), sel('dpi', 'Quality', [[150, 'Standard'], [200, 'High'], [300, 'Best']]), chk('landscape', 'Landscape')]);

    group('On each play', [chk('showName', 'Play name'), chk('showNumber', 'Number'), chk('showNotes', 'Notes'), chk('showSection', 'Section'), chk('showFormation', 'Formation and distance'),
      chk('showStats', 'Test results'), chk('defense', 'The defense (X\'s)'), chk('field', 'Yard lines'), chk('gain', 'Line to gain'), chk('letters', 'Player letters'), chk('routeNumbers', 'Route numbers'), chk('reads', 'The read (star and 2)')]);

    group('Look', [chk('color', 'Colour (off prints black and white)'), sel('weight', 'Lines', [[0.7, 'Thin'], [1, 'Normal'], [1.5, 'Bold']]), sel('fontScale', 'Text', [[0.85, 'Small'], [1, 'Normal'], [1.2, 'Large'], [1.4, 'Extra large']])]);

    group('Header', [text('title', 'Title', b.name), text('team', 'Team', b.team || ''), chk('date', 'Date'), chk('pageNumbers', 'Page numbers')]);
    schedulePreview();
  }
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 200); }
  function renderPreview() {
    var b = cur.book, box = $('exportPreview'); if (!b) return;
    var o = JSON.parse(JSON.stringify(exportOpt())); o.dpi = 60;
    var pages = X.pages(b, o);
    box.innerHTML = '';
    var np = X.pick(b, o).length;
    box.appendChild(el('p', { class: 'help', text: np + (np === 1 ? ' play on ' : ' plays on ') + pages.length + (pages.length === 1 ? ' page.' : ' pages.') + (pages.length > 3 ? ' The first three are shown.' : '') }));
    pages.slice(0, 3).forEach(function (c) { var img = el('img', { class: 'page', alt: 'A page of the export' }); img.src = c.toDataURL('image/png'); box.appendChild(img); });
  }
  $('bPrint').addEventListener('click', function () { if (cur.book) X.print(X.pages(cur.book, exportOpt()), exportOpt()); });
  $('bPagesPng').addEventListener('click', function () {
    if (!cur.book) return;
    X.pages(cur.book, exportOpt()).forEach(function (c, i) { setTimeout(function () { X.download(c, X.slug(cur.book.name) + '-page-' + (i + 1) + '.png'); }, i * 350); });
  });
  $('bPlaysPng').addEventListener('click', function () {
    var b = cur.book; if (!b) return;
    var o = exportOpt();
    X.pick(b, o).forEach(function (it, i) {
      setTimeout(function () {
        var c = document.createElement('canvas'); c.width = 1200; c.height = 1000;
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1200, 1000);
        x.fillStyle = '#111'; x.font = '800 44px Inter, Arial, sans-serif'; x.textBaseline = 'top';
        x.fillText((it.number ? it.number + '  ' : '') + it.entry.name, 30, 24);
        window.FAW_DIAGRAM.draw(x, 20, 90, 1160, 890, it.entry.play, { color: o.color, defense: o.defense, distance: it.entry.distance, field: o.field, gain: o.gain, letters: o.letters, numbers: o.routeNumbers, reads: o.reads, weight: o.weight });
        X.download(c, X.slug((it.number ? it.number + ' ' : '') + it.entry.name) + '.png');
      }, i * 350);
    });
  });

  /* ---------- which screen is up ---------- */
  function rerender() {
    if (!$('sBooks').hidden) renderBooks();
    if (!$('sBook').hidden) { if (cur.book) cur.book = store.book(cur.book.id); renderBook(); }
    if (!$('sTerms').hidden) renderTerms();
  }
  UI.hook('shown', function (id) {
    if (id !== 'sBoard' && id !== 'sLive' && id !== 'sPick' && UI.mode() === 'edit') { saveEntry(); UI.setMode('build'); UI.formChips([]); cur.entry = null; }
    if (id === 'sBooks') renderBooks();
    if (id === 'sBook') renderBook();
    if (id === 'sTerms') renderTerms();
    if (id === 'sExport') renderExport();
  });

  window.FAW_BOOKUI = { store: store, openBook: openBook, editPlay: editPlay, current: function () { return cur; }, terms: terms };
})();
