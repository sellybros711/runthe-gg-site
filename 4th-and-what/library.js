/* 4th and What: Playbooks, the library.
 *
 *   left     the account's playbooks, + New Playbook, import a file
 *   Plays    every play as a card (a turf picture, its number, type and
 *            formation, how it tested); search, filter by formation and type,
 *            grid or list; each card opens in the Studio, runs, tests, learns,
 *            copies, flips, moves to a section or goes
 *   Sections the book's sections, in order (an install day each, for the packet)
 *   Terminology  the coach's words, which name every play (names.js)
 *   Share    the playbook file, to keep or hand to another coach
 *
 * Playbooks need a Run The Games account (the owner's call, 2026-10-30).
 * Teams, team codes and player tracking are the next build (the owner, 2026-10-31).
 *
 * Plain script: window.FAW_LIBRARY (for the checks).
 */
(function () {
  'use strict';
  var A = window.FAW_APP, B = window.FAW_BOOK, N = window.FAW_NAMES, F = window.FAW_FORMATIONS, T = window.FAW_TURF, E = window.FAW_ENGINE, X = window.FAW_EXPORT;
  var $ = function (id) { return document.getElementById(id); }, el = A.el;
  var cur = null, tab = 'plays', layoutMode = 'grid', menuOpen = null, termsT = 0, upgraded = {};

  function book() { return cur ? A.store.book(cur) : null; }
  function put(b) { A.store.put(b); }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(); } catch (e) { return ''; } }

  function render() {
    var inn = A.signedIn(), si = $('bSignin');
    si.querySelector('h2').textContent = 'Your playbooks live on your account';
    si.querySelector('p').textContent = 'Sign in with your Run The Games account. Your plays follow you to any phone or laptop.';
    $('bSigninBtn').hidden = false;
    si.hidden = inn; $('bMain').hidden = !inn; $('bNewBook').disabled = !inn; $('bImport').disabled = !inn;
    $('bList').innerHTML = '';
    if (!inn) return;
    if (!A.store.ready()) { A.openStore().then(render); return; }
    var books = A.store.books();
    if (!cur || !A.store.book(cur)) cur = books[0] ? books[0].id : null;
    books.forEach(function (b) {
      $('bList').appendChild(el('button', { type: 'button', class: b.id === cur ? 'on' : '', 'data-book': b.id, on: { click: function () { cur = b.id; render(); } } }, [el('span', { text: b.name }), el('small', { text: String(b.plays.length) })]));
    });
    var b = book();
    $('bMain').hidden = !b;
    if (!b) { $('bSignin').hidden = false; $('bSignin').querySelector('h2').textContent = 'No playbooks yet'; $('bSignin').querySelector('p').textContent = 'Start one with + New Playbook, or save a play from the Studio.'; $('bSigninBtn').hidden = true; return; }
    if (B.upgrade && !upgraded[b.id]) { upgraded[b.id] = true; var was = JSON.stringify(b); B.upgrade(b); if (JSON.stringify(b) !== was) put(b); }
    $('bName').value = b.name; $('bTeam').value = b.team || ''; $('bLevel').value = b.level || 'nfl';
    $('bMeta').textContent = b.plays.length + (b.plays.length === 1 ? ' play' : ' plays') + ' · Updated ' + fmtDate(b.updated);
    Array.prototype.forEach.call(document.querySelectorAll('#bTabs button'), function (x) { x.classList.toggle('on', x.dataset.bt === tab); });
    $('bPlays').hidden = tab !== 'plays'; $('bSections').hidden = tab !== 'sections'; $('bTerms').hidden = tab !== 'terms'; $('bShare').hidden = tab !== 'share';
    if (tab === 'plays') renderPlays(b);
    if (tab === 'sections') renderSections(b);
    if (tab === 'terms') renderTerms();
    if (tab === 'share') renderShare(b);
  }
  Array.prototype.forEach.call(document.querySelectorAll('#bTabs button'), function (x) { x.addEventListener('click', function () { tab = x.dataset.bt; render(); }); });
  $('bSigninBtn').addEventListener('click', function () { if (window.RTGAuthUI && window.RTGAuthUI.open) window.RTGAuthUI.open(); });
  /* the level the playbook plays at: Run it, Test and the play's stats use it */
  $('bLevel').addEventListener('change', function () { var b = book(); if (b) { b.level = this.value; put(b); A.setLevel(b.level); render(); } });
  $('bName').addEventListener('change', function () { var b = book(); if (b) { b.name = this.value.trim() || 'My playbook'; put(b); render(); } });
  $('bTeam').addEventListener('change', function () { var b = book(); if (b) { b.team = this.value.trim(); put(b); } });
  $('bNewBook').addEventListener('click', function () {
    var b = A.store.put(B.newBook('My playbook')); cur = b.id; tab = 'plays'; render();
    setTimeout(function () { $('bName').focus(); $('bName').select(); }, 50);
  });
  $('bImport').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = ''; if (!f) return;
    f.text().then(function (t) {
      var r = B.importFile(t);
      A.store.put(r.book); cur = r.book.id;
      if (r.terms && window.confirm('This file has its own terminology. Use it for your plays?')) A.store.setTerms(r.terms);
      tab = 'plays'; render();
    }).catch(function (e) { window.alert(e && e.message ? e.message : 'That file could not be read.'); });
  });

  /* ---------- the plays ---------- */
  A.fill($('bFForm'), [['', 'All formations']].concat(F.SETS.map(function (s) { return [s.id, N.FORMATION_WORD[s.id] || s.name]; })), '');
  ['bSearch', 'bFForm', 'bFType'].forEach(function (id) { $(id).addEventListener('input', function () { var b = book(); if (b) renderPlays(b); }); });
  Array.prototype.forEach.call(document.querySelectorAll('#bLayout button'), function (x) {
    x.addEventListener('click', function () { layoutMode = x.dataset.l; Array.prototype.forEach.call(document.querySelectorAll('#bLayout button'), function (y) { y.classList.toggle('on', y === x); }); var b = book(); if (b) renderPlays(b); });
  });
  $('bNewPlay').addEventListener('click', function () {
    var b = book(); if (!b) return;
    if (b.plays.length >= B.MAX_PLAYS) { window.alert('A playbook holds ' + B.MAX_PLAYS + ' plays. Start another.'); return; }
    var e = B.newPlay(b, A.emptyPlay('gun3x1'), { section: b.sections[0].id, distance: A.SC.distance });
    e.name = A.nameFor(e.play, b); b.plays.push(e); put(b);
    window.FAW_STUDIO.open(b.id, e.id);
  });
  function tested(p) {
    var S = B.statsOf(p, book() && book().level), st = S[p.distance], t = st && st.test, n = 0, w = 0;
    if (t) E.CALL_KEYS.forEach(function (k) { if (t[k]) { n += t[k].n; w += t[k].w; } });
    return n ? Math.round(w * 100 / n) : null;
  }
  function renderPlays(b) {
    var box = $('bCards'); box.innerHTML = ''; box.className = 'cards' + (layoutMode === 'list' ? ' list' : '');
    var q = $('bSearch').value.trim().toLowerCase(), ff = $('bFForm').value, ft = $('bFType').value;
    var list = b.plays.filter(function (p) {
      if (q && p.name.toLowerCase().indexOf(q) < 0 && String(p.num) !== q) return false;
      if (ff && p.play.formation !== ff) return false;
      if (ft && (p.tag || A.tagOf(p.play)) !== ft) return false;
      return true;
    });
    if (!list.length) box.appendChild(el('p', { class: 'help', text: b.plays.length ? 'No plays match.' : 'No plays yet. + New Play, or save one from the Studio.' }));
    list.forEach(function (p) {
      var tag = p.tag || A.tagOf(p.play), rate = tested(p), sec = null;
      b.sections.forEach(function (s) { if (s.id === p.section) sec = s.name; });
      var card = el('div', { class: 'pcard', 'data-play': p.id }, [
        el('div', { class: 'ph' }, [el('b', { text: p.name }), el('span', {}, [p.fav ? el('span', { class: 'fav', text: '★ ' }) : null,
          el('button', { type: 'button', class: 'more', text: '⋮', 'aria-label': 'More for ' + p.name, on: { click: function (ev) { ev.stopPropagation(); menu(card, b, p); } } })])]),
        el('button', { type: 'button', class: 'thumbbtn', 'aria-label': 'Open ' + p.name, on: { click: function () { window.FAW_STUDIO.open(b.id, p.id); } } }, [T.thumb(p.play, 220, 120, { distance: p.distance })]),
        el('div', { class: 'tags' }, [p.num != null ? el('span', { class: 'tagc num', text: '#' + p.num }) : null, el('span', { class: 'tagc', text: N.FORMATION_WORD[p.play.formation] || p.play.formation }),
          el('span', { class: 'tagc ' + tag, text: tag === 'rpo' ? 'RPO' : tag.charAt(0).toUpperCase() + tag.slice(1) }),
          sec && b.sections.length > 1 ? el('span', { class: 'tagc', text: sec }) : null,
          rate != null ? el('span', { class: 'rate', text: rate + '% tested' }) : null])
      ]);
      box.appendChild(card);
    });
  }
  function menu(card, b, p) {
    if (menuOpen) { menuOpen.remove(); if (menuOpen._card === card) { menuOpen = null; return; } }
    var i = b.plays.indexOf(p);
    function item(text, fn) { return el('button', { type: 'button', text: text, on: { click: function () { m.remove(); menuOpen = null; fn(); } } }); }
    var m = el('div', { class: 'menu' }, [
      item('Edit in Studio', function () { window.FAW_STUDIO.open(b.id, p.id); }),
      item('Run it', function () { A.setLevel(b.level || 'nfl'); window.FAW_STUDIO.open(b.id, p.id, { mode: 'game' }); window.FAW_FLOW.snap(); }),
      item('Test vs Defense', function () { A.testChoice = 'b:' + b.id + ':' + p.id; A.show('test'); }),
      item('Learn it', function () { A.learnChoice = { book: b.id, play: p.id }; A.show('learn'); }),
      item(p.fav ? 'Unstar' : 'Star', function () { p.fav = !p.fav; put(b); render(); }),
      item('Copy', function () { var c = A.copy(p); c.id = B.newId(); c.name = p.name + ' 2'; c.nameEdited = true; c.stats = {}; delete c.num; b.plays.splice(i + 1, 0, c); if (B.ensureNumbers) B.ensureNumbers(b); put(b); render(); }),
      item('Copy, flipped', function () {
        var c = A.copy(p); c.id = B.newId(); c.play = window.FAW_STUDIO.flip(p.play); c.stats = {}; delete c.num;
        c.nameEdited = false; c.name = A.nameFor(c.play, b); b.plays.splice(i + 1, 0, c); if (B.ensureNumbers) B.ensureNumbers(b); put(b); render();
      }),
      el('label', { class: 'field' }, [el('span', { text: 'Section' }), A.select(b.sections.map(function (s) { return [s.id, s.name]; }), p.section, function (v) { p.section = v; put(b); m.remove(); menuOpen = null; render(); })]),
      item('Delete', function () { if (window.confirm('Delete "' + p.name + '"?')) { b.plays.splice(b.plays.indexOf(p), 1); put(b); render(); } })
    ]);
    m._card = card; card.appendChild(m); menuOpen = m;
  }
  document.addEventListener('click', function (ev) { if (menuOpen && !menuOpen.contains(ev.target)) { menuOpen.remove(); menuOpen = null; } });

  /* ---------- sections ---------- */
  function renderSections(b) {
    var box = $('bSections'); box.innerHTML = '';
    box.appendChild(el('p', { class: 'help', text: 'Sections group your plays. In an install packet, each section prints as a day.' }));
    b.sections.forEach(function (s, si) {
      var n = b.plays.filter(function (p) { return p.section === s.id; }).length;
      box.appendChild(el('div', { class: 'secrow' }, [
        el('input', { value: s.name, maxlength: '40', 'aria-label': 'Section name', on: { change: function () { s.name = this.value.trim() || 'Plays'; put(b); } } }),
        el('small', { text: n + (n === 1 ? ' play' : ' plays') }),
        el('button', { type: 'button', class: 'btn mini', text: 'Up', on: { click: function () { if (si > 0) { b.sections.splice(si - 1, 0, b.sections.splice(si, 1)[0]); put(b); render(); } } } }),
        b.sections.length > 1 ? el('button', { type: 'button', class: 'btn mini danger', text: 'Remove', on: { click: function () {
          if (n && !window.confirm('Move its ' + n + ' plays to the first section and remove "' + s.name + '"?')) return;
          b.sections.splice(si, 1); var to = b.sections[0].id; b.plays.forEach(function (p) { if (p.section === s.id) p.section = to; }); put(b); render();
        } } }) : null
      ]));
    });
    box.appendChild(el('div', { class: 'acts' }, [el('button', { type: 'button', class: 'btn', text: '+ New section', on: { click: function () { b.sections.push({ id: B.newId(), name: 'New section' }); put(b); render(); } } }),
      el('button', { type: 'button', class: 'btn danger', text: 'Delete playbook', on: { click: function () {
        if (!window.confirm('Delete "' + b.name + '" and its ' + b.plays.length + ' plays? This cannot be undone.')) return;
        A.store.remove(b.id); cur = null; tab = 'plays'; render();
      } } })]));
  }

  /* ---------- terminology ---------- */
  var SIDES = [['any', 'Anywhere'], ['left', 'On the left'], ['right', 'On the right'], ['strong', 'To the strength'], ['weak', 'Away from it']];
  var WHOS = [['any', 'Any player'], ['X', 'The X'], ['Z', 'The Z'], ['H', 'The H'], ['Y', 'The Y'], ['R', 'The R']];
  var TYPES = N.ROUTE_TYPES.map(function (t) { return [t, N.ROUTE_LABEL[t]]; });
  var ORDERS = [['formation side play', 'Formation, side, play (Trips Right Seminole)'], ['play formation side', 'Play, formation, side (Seminole Trips Right)'],
    ['formation play', 'Formation, play (Trips Seminole)'], ['play', 'The play only (Seminole)']];
  var SAMPLE = { formation: 'gun3x1', moved: {}, routes: [{ who: 'WR1', pts: [[-13.5, 1.5], [-9.5, 5.5]] }, { who: 'SLOT', pts: [[-9.5, 1], [-13.5, 3]] }, { who: 'TE', pts: [[-6.2, 6], [-6, 5]] }, { who: 'WR2', pts: [[13.5, 12], [12.5, 10]] }], blocks: [{ who: 'RB', to: [2, -4] }], handoff: null, targets: ['WR1', 'SLOT'] };
  function setTerms(t) {
    A.store.setTerms(t);
    clearTimeout(termsT);
    termsT = setTimeout(function () {
      /* a play whose name was never typed by hand follows the new words */
      A.store.books().forEach(function (b) {
        var changed = false;
        b.plays.forEach(function (p) { if (!p.nameEdited) { var n = A.nameFor(p.play, b); if (n !== p.name) { p.name = n; changed = true; } } });
        if (changed) A.store.put(b);
      });
    }, 600);
    example();
  }
  function example() {
    var box = $('bTerms').querySelector('.example'); if (!box) return;
    box.innerHTML = '';
    box.appendChild(T.thumb(SAMPLE, 180, 100));
    box.appendChild(el('div', {}, [el('small', { text: 'This play is named' }), el('b', { text: N.suggest(SAMPLE, A.terms()).name })]));
  }
  function renderTerms() {
    var t = A.terms(), out = $('bTerms'); out.innerHTML = '';
    out.appendChild(el('p', { class: 'help', text: 'Teach it your words once. Every play is named from them. A name you type yourself never changes.' }));
    out.appendChild(el('div', { class: 'example' }));
    example();
    function save() { setTerms(t); }
    function group(title, help, body) { out.appendChild(el('section', { class: 'tgroup' }, [el('h3', { text: title }), help ? el('p', { class: 'help', text: help }) : null].concat(body))); }
    group('Naming style', 'Used for any route you have not given a word.', [
      A.select([['words', 'Route words (Slant Flat)'], ['tree', 'Route tree numbers (21)']], t.preset, function (v) { t.preset = v; save(); }),
      el('label', { class: 'field' }, [el('span', { text: 'Name order' }), A.select(ORDERS, t.pattern.join(' '), function (v) { t.pattern = v.split(' '); save(); })])
    ]);
    group('Formation words', null, F.SETS.map(function (s) {
      return el('label', { class: 'field' }, [el('span', { text: s.name }), el('input', { maxlength: '24', value: t.formations[s.id] || '', placeholder: N.FORMATION_WORD[s.id], on: { input: function () { if (this.value.trim()) t.formations[s.id] = this.value.trim(); else delete t.formations[s.id]; save(); } } })]);
    }));
    function rules(list, title, help, blank, fields) {
      var body = [];
      list.forEach(function (r, i) {
        var row = el('div', { class: 'rule' });
        fields(r).forEach(function (f) { row.appendChild(f); });
        row.appendChild(el('input', { class: 'word', maxlength: '24', value: r.word || '', placeholder: 'Your word', 'aria-label': 'Word', on: { input: function () { r.word = this.value.trim(); save(); } } }));
        row.appendChild(el('button', { type: 'button', class: 'btn mini', text: 'Remove', on: { click: function () { list.splice(i, 1); save(); renderTerms(); } } }));
        body.push(row);
      });
      body.push(el('button', { type: 'button', class: 'btn', text: 'Add', on: { click: function () { list.push(blank()); save(); renderTerms(); } } }));
      group(title, help, body);
    }
    rules(t.routes, 'Route words', 'A route, where it is run, and your word for it. The most exact rule wins: a player beats a side, a side beats anywhere.',
      function () { return { type: 'slant', side: 'left', who: 'any', word: '' }; },
      function (r) { return [A.select(TYPES, r.type, function (v) { r.type = v; save(); }), A.select(SIDES, r.side || 'any', function (v) { r.side = v; save(); }), A.select(WHOS, r.who || 'any', function (v) { r.who = v; save(); })]; });
    rules(t.concepts, 'Concept words', 'Two or three routes on the same side, named together. A concept is used before single route words.',
      function () { return { types: ['slant', 'flat'], side: 'any', word: '' }; },
      function (r) {
        var third = [['', 'and nothing else']].concat(TYPES);
        return [A.select(TYPES, r.types[0], function (v) { r.types[0] = v; save(); }), A.select(TYPES, r.types[1], function (v) { r.types[1] = v; save(); }),
          A.select(third, r.types[2] || '', function (v) { if (v) r.types[2] = v; else r.types.length = 2; save(); }), A.select(SIDES, r.side || 'any', function (v) { r.side = v; save(); })];
      });
    rules(t.runs, 'Run words', 'A handoff, which way it goes and whether someone leads, and your word for it.',
      function () { return { carrier: 'any', dir: 'any', side: 'any', lead: 'any', word: '' }; },
      function (r) {
        return [A.select([['any', 'Any carrier'], ['R', 'The R'], ['Q', 'QB keeps it'], ['Y', 'The Y'], ['H', 'The H']], r.carrier || 'any', function (v) { r.carrier = v; save(); }),
          A.select([['any', 'Inside or out'], ['inside', 'Inside'], ['outside', 'Outside']], r.dir || 'any', function (v) { r.dir = v; save(); }),
          A.select([['any', 'Either way'], ['left', 'To the left'], ['right', 'To the right'], ['middle', 'Straight ahead']], r.side || 'any', function (v) { r.side = v; save(); }),
          A.select([['any', 'Lead block or not'], ['yes', 'With a lead block'], ['no', 'No lead block']], r.lead || 'any', function (v) { r.lead = v; save(); })];
      });
  }

  /* ---------- share ---------- */
  function renderShare(b) {
    var box = $('bShare'); box.innerHTML = '';
    box.appendChild(el('p', { class: 'help', text: 'The playbook file keeps every play, section, formation and your terminology. Another coach imports it as a copy.' }));
    box.appendChild(el('div', { class: 'acts' }, [el('button', { type: 'button', class: 'btn gold', text: 'Download playbook file', on: { click: function () { X.downloadText(B.exportFile(b, A.store.terms()), X.slug(b.name) + '.4th-and-what.json'); } } }),
      el('button', { type: 'button', class: 'btn', text: 'Print it', on: { click: function () { A.printBook = b.id; A.show('print'); } } })]));
  }

  A.on('books', render);
  A.on('remote', function () { if (A.current() === 'books') render(); });
  window.FAW_LIBRARY = { open: function (id) { cur = id; tab = 'plays'; A.show('books'); }, current: function () { return cur; }, render: render };
})();
