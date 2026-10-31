/* 4th and What: the Coach Studio, where a play is made.
 *
 * The field is turf (turf.js) and the play is the engine's play object, in
 * yards from the ball. Seven tools, and each does one thing:
 *   Move     drag the QB or a receiver to line him up. The ONLY tool that
 *            moves a player (the owner's rule, 2026-10-31).
 *   Route    drag from a receiver to draw his route; drag from its end to add.
 *   Block    drag a short bar from a receiver or back: he stays in, or leads.
 *   Run      tap the QB, then a back (or the QB again): a handoff; drag the path.
 *   Read     tap receivers in the order the QB reads them: 1st, 2nd, 3rd. The
 *            last one is the checkdown when the pocket goes (the owner's ask,
 *            2026-10-31: "choose the 1st, 2nd, and 3rd read").
 *   Motion   drag from a receiver along the line: where he goes before the snap.
 *   Erase    tap a player to take away what he was given.
 * The Players panel does the same with lists: a route from the library at a
 * depth, a block, a read. Concepts put a whole play on the formation.
 *
 * The draft lives in FAW_APP.draft, so Play and Test see what is drawn here.
 *
 * Plain script: window.FAW_STUDIO (for the checks).
 */
(function () {
  'use strict';
  var A = window.FAW_APP, F = window.FAW_FORMATIONS, R = window.FAW_ROUTES, T = window.FAW_TURF, E = window.FAW_ENGINE, N = window.FAW_NAMES, B = window.FAW_BOOK;
  var $ = function (id) { return document.getElementById(id); }, el = A.el;
  var WHO = { WR1: 'X', WR2: 'Z', SLOT: 'H', TE: 'Y', RB: 'RB', QB: 'QB' };
  var tool = 'route', armed = false, drag = null, undo = [], view = 'offense', call = 'cover3', V = null;
  var canvas = $('sField');

  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function P() { return A.draft.play; }
  function O() { return F.place(P().formation, P().moved); }
  function routeOf(id) { var r = null; P().routes.forEach(function (x) { if (x.who === id) r = x; }); return r; }
  function blockOf(id) { var r = null; P().blocks.forEach(function (x) { if (x.who === id) r = x; }); return r; }
  function isRun() { return !!(P().handoff && P().handoff.to); }
  function snapSpot(id) { var p = P(), m = p.motion; return m && m.who === id && m.pts && m.pts.length ? m.pts[m.pts.length - 1] : O()[id]; }
  function book() { var r = A.draft.ref; return r && A.signedIn() ? A.store.book(r.book) : null; }
  function entry() { var b = book(), r = A.draft.ref; if (!b) return null; var e = null; b.plays.forEach(function (p) { if (p.id === r.id) e = p; }); return e; }
  function save() { undo.push(JSON.stringify(P())); if (undo.length > 80) undo.shift(); }

  /* ---------- the picture ---------- */
  function layout() {
    var sc = A.SC, Y0 = 100 - sc.ballOn;
    if (!V) V = T.view(canvas, {});
    V.set({ BX: sc.ballX, Y0: Y0, marker: Math.min(100, Y0 + sc.distance), behind: 11, ahead: 27 , across: T.across() });
    V.layout(); draw();
  }
  function draw() {
    if (!V) return;
    var p = P(), plans = null;
    if (view !== 'offense' && E.plans) { try { plans = E.plans(A.SC, p, call); } catch (e) { plans = null; } }
    V.field().play(p, {
      offense: view !== 'defense', defense: view !== 'offense', defenseStyle: 'letters', plans: plans, coverage: !!plans,
      distance: A.SC.distance, depths: true, hot: drag && drag.who ? [drag.who] : armed ? ['QB'] : null
    });
    if (drag && drag.pts && drag.pts.length > 1) {
      var ctx = canvas.getContext('2d'), s = V.scale();
      ctx.strokeStyle = drag.kind === 'block' ? '#fff' : drag.kind === 'path' ? '#36d399' : '#ffd23f'; ctx.lineWidth = Math.max(2, s * 0.3); ctx.setLineDash([6, 5]);
      ctx.beginPath(); drag.pts.forEach(function (q, i) { var r = canvas.getBoundingClientRect(), sp = V.toScreen(q); if (i) ctx.lineTo(sp[0] - r.left, sp[1] - r.top); else ctx.moveTo(sp[0] - r.left, sp[1] - r.top); }); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function changed() {
    var p = P();
    p.targets = (p.targets || []).filter(function (id) { return routeOf(id) && !blockOf(id); }).slice(0, 3);
    if (isRun()) p.targets = [];
    if (A.draft.tag !== 'rpo' && A.draft.tag !== 'special') A.draft.tag = A.tagOf(p);
    name();
    A.saveDraft();
    draw(); renderPlayers(); renderCard(); renderBar();
    var e = entry(); if (e) { e.play = A.copy(p); e.name = A.draft.name || e.name; e.nameEdited = A.draft.nameEdited; e.tag = A.draft.tag; e.updated = new Date().toISOString(); saveSoon(); }
  }
  var saveT = 0;
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(function () { var b = book(); if (b) A.store.put(b); }, 700); }

  /* ---------- the name ---------- */
  function name() {
    var sug = A.nameFor(P(), book());
    if (!A.draft.nameEdited) A.draft.name = sug;
    $('sName').value = A.draft.name;
    $('sSuggest').textContent = A.draft.nameEdited ? 'Your terminology says: ' + sug + '. Tap to use it.' : 'Named from your terminology.';
    $('sSuggest').dataset.sug = sug;
  }
  $('sName').addEventListener('input', function () { A.draft.name = this.value.trim() || 'Play'; A.draft.nameEdited = true; name(); A.saveDraft(); var e = entry(); if (e) { e.name = A.draft.name; e.nameEdited = true; saveSoon(); } });
  $('sSuggest').addEventListener('click', function () { if (!A.draft.nameEdited) return; A.draft.nameEdited = false; changed(); });

  /* ---------- the top bar ---------- */
  function renderBar() {
    var b = book(), opts = [{ group: 'Formations', items: F.SETS.map(function (s) { return [s.id, s.name]; }) }];
    if (b && b.formations && b.formations.length) opts.push({ group: 'Saved in ' + b.name, items: b.formations.map(function (f) { return ['f:' + f.id, f.name]; }) });
    A.fill($('sForm'), opts, P().customFormation ? 'f:' + P().customFormation : P().formation);
    $('sTag').value = A.draft.tag || 'pass';
    $('sFav').setAttribute('aria-pressed', String(!!A.draft.fav));
    $('sSave').textContent = A.draft.ref && entry() ? 'Saved' : 'Save Play';
    $('sMotion').checked = !!P().motion; $('sMotionRow').hidden = !P().motion;
    $('sPA').checked = !!P().playAction; $('sPA').disabled = isRun();
    $('sShowD').checked = view !== 'offense';
  }
  $('sForm').addEventListener('change', function () {
    var v = this.value; save();
    if (v.indexOf('f:') === 0) {
      var f = A.customOf(book(), v.slice(2));
      if (f) { var np = A.emptyPlay(f.base); np.moved = A.copy(f.moved || {}); np.customFormation = f.id; A.draft.play = np; }
    } else A.draft.play = A.emptyPlay(v);
    changed();
  });
  $('sTag').addEventListener('change', function () { A.draft.tag = this.value; A.saveDraft(); var e = entry(); if (e) { e.tag = this.value; saveSoon(); } });
  $('sFav').addEventListener('click', function () { A.draft.fav = !A.draft.fav; renderBar(); A.saveDraft(); var e = entry(); if (e) { e.fav = A.draft.fav; saveSoon(); } });
  $('sSave').addEventListener('click', function () {
    var e = entry();
    if (e) { e.play = A.copy(P()); var b = book(); A.store.put(b); A.toast('sToast', 'Saved to ' + b.name + '.'); return; }
    A.saveDialog(A.copy(P()), { name: A.draft.nameEdited ? A.draft.name : null, tag: A.draft.tag, fav: A.draft.fav, notes: A.draft.notes, situations: A.draft.situations, distance: A.SC.distance, done: function (b, e2) {
      A.draft.ref = { book: b.id, id: e2.id }; A.draft.name = e2.name; A.draft.nameEdited = e2.nameEdited; A.saveDraft(); renderBar(); renderCard();
      A.toast('sToast', 'Saved to ' + b.name + '.');
    } });
  });

  /* ---------- the libraries: formations and concepts ---------- */
  var libTab = 'formations';
  Array.prototype.forEach.call(document.querySelectorAll('[data-lib]'), function (b) {
    b.addEventListener('click', function () { libTab = b.dataset.lib; Array.prototype.forEach.call(document.querySelectorAll('[data-lib]'), function (x) { x.classList.toggle('on', x === b); }); renderLib(); });
  });
  function renderLib() {
    var box = $('sLib'); box.innerHTML = '';
    if (libTab === 'formations') {
      F.SETS.forEach(function (s) {
        var on = !P().customFormation && P().formation === s.id;
        box.appendChild(el('button', { type: 'button', class: 'libitem', 'aria-pressed': String(on), 'data-form': s.id, on: { click: function () { save(); A.draft.play = A.emptyPlay(s.id); changed(); renderLib(); } } },
          [T.thumb(A.emptyPlay(s.id), 92, 46, { reads: false }), el('span', {}, [el('b', { text: (N.FORMATION_WORD[s.id] || s.name) }), el('small', { text: s.name })])]));
      });
      var b = book();
      if (b && b.formations) b.formations.forEach(function (f) {
        var p = A.emptyPlay(f.base); p.moved = f.moved || {};
        box.appendChild(el('button', { type: 'button', class: 'libitem', 'aria-pressed': String(P().customFormation === f.id), on: { click: function () { save(); var np = A.emptyPlay(f.base); np.moved = A.copy(f.moved || {}); np.customFormation = f.id; A.draft.play = np; changed(); renderLib(); } } },
          [T.thumb(p, 92, 46, { reads: false }), el('span', {}, [el('b', { text: f.name }), el('small', { text: 'Saved formation' })])]));
      });
      box.appendChild(el('button', { type: 'button', class: 'btn mini', text: 'Save this formation', on: { click: saveFormation } }));
    } else {
      ['pass', 'run'].forEach(function (kind) {
        box.appendChild(el('p', { class: 'libgroup', text: kind === 'pass' ? 'Pass concepts' : 'Run concepts' }));
        R.CONCEPTS.filter(function (c) { return c.kind === kind; }).forEach(function (c) {
          var p = R.apply({ formation: P().formation, moved: P().moved, customFormation: P().customFormation }, c.name);
          box.appendChild(el('button', { type: 'button', class: 'libitem', 'data-concept': c.name, on: { click: function () { save(); var np = R.apply(P(), c.name); if (P().motion) np.motion = A.copy(P().motion); A.draft.play = np; changed(); } } },
            [T.thumb(p, 92, 46, { reads: false }), el('span', {}, [el('b', { text: c.name }), el('small', { text: kind === 'pass' ? 'On this formation' : 'Run' })])]));
        });
      });
    }
  }
  function saveFormation() {
    var b = book();
    if (!b) { A.toast('sToast', 'Save the play to a playbook first. Formations are kept in a book.'); return; }
    var nm = window.prompt('Name this formation (your players where they stand now).', 'Bunch Right');
    if (!nm) return;
    var f = { id: B.newId(), name: nm.trim().slice(0, 30), base: P().formation, moved: A.copy(P().moved || {}) };
    b.formations = b.formations || []; b.formations.push(f); A.store.put(b);
    P().customFormation = f.id; changed(); renderLib();
    A.toast('sToast', 'Saved "' + f.name + '" to ' + b.name + '.');
  }

  /* ---------- the players panel ---------- */
  var sideTab = 'players';
  Array.prototype.forEach.call(document.querySelectorAll('[data-side]'), function (b) {
    b.addEventListener('click', function () { sideTab = b.dataset.side; Array.prototype.forEach.call(document.querySelectorAll('[data-side]'), function (x) { x.classList.toggle('on', x === b); }); $('sPlayers').hidden = sideTab !== 'players'; $('sCard').hidden = sideTab !== 'card'; renderCard(); });
  });
  function giveRoute(id, type, depth) {
    var p = P(); save();
    p.routes = p.routes.filter(function (r) { return r.who !== id; });
    p.blocks = p.blocks.filter(function (b) { return b.who !== id; });
    if (isRun() && p.handoff.to === id) p.handoff = null;
    if (type === 'none') { p.targets = p.targets.filter(function (x) { return x !== id; }); }
    else if (type === 'block') { var a = snapSpot(id); p.blocks.push({ who: id, to: [a[0] + (a[0] < 0 ? 1.2 : -1.2), a[1] - 1.6] }); }
    else if (type === 'carry') { var c = O()[id]; p.handoff = { to: id, path: [[c[0], Math.max(2, c[1] + 6)]] }; p.targets = []; }
    else {
      var r = { who: id, type: type, depth: depth, pts: R.make(type, snapSpot(id), depth) };
      p.routes.push(r);
      if (!p.targets.length) p.targets.push(id);
    }
    changed();
  }
  function renderPlayers() {
    var box = $('sPlayers'); if (sideTab !== 'players') return;
    box.innerHTML = '';
    var p = P();
    F.EDITABLE.forEach(function (id) {
      var r = routeOf(id), b = blockOf(id), carry = isRun() && p.handoff.to === id;
      var cur = carry ? 'carry' : b ? 'block' : r ? (r.type && R.BY[r.type] ? r.type : 'custom') : 'none';
      var opts = [];
      if (id === 'QB') opts = [['none', isRun() ? 'Hands off' : 'Throws'], ['carry', 'Keeps it (QB run)']];
      else {
        opts = [['none', 'Nothing yet']];
        if (cur === 'custom') opts.push(['custom', 'Drawn route']);
        R.LIST.forEach(function (x) { opts.push([x.type, x.label]); });
        opts.push(['block', 'Block']);
        if (F.isBackfield(O()[id]) || id === 'RB') opts.push(['carry', 'Carries it']);
      }
      var sel = A.select(opts, cur, function (v) { if (v === 'custom') return; giveRoute(id, v, R.BY[v] ? R.BY[v].depth : null); });
      sel.setAttribute('aria-label', WHO[id] + ' assignment');
      var depth = null;
      if (r && r.type && R.BY[r.type]) {
        depth = el('span', { class: 'depth' }, [
          el('button', { type: 'button', text: '-', 'aria-label': 'Shallower', on: { click: function () { giveRoute(id, r.type, Math.max(1, (r.depth || R.BY[r.type].depth) - 1)); } } }),
          el('span', { text: (r.depth || R.BY[r.type].depth) + ' yd' }),
          el('button', { type: 'button', text: '+', 'aria-label': 'Deeper', on: { click: function () { giveRoute(id, r.type, Math.min(40, (r.depth || R.BY[r.type].depth) + 1)); } } })
        ]);
      }
      var row = el('div', { class: 'prow', 'data-who': id }, [el('span', { class: 'pchip', text: WHO[id], style: 'background:' + T.COLOR[id] }), sel, depth || el('span')]);
      if (r && !isRun() && id !== 'QB') {
        var i = p.targets.indexOf(id);
        row.appendChild(el('div', { class: 'readc' }, [1, 2, 3].map(function (n) {
          return el('button', { type: 'button', class: i === n - 1 ? 'on' : '', text: n === 1 ? '1st read' : n === 2 ? '2nd' : '3rd', on: { click: function () { setRead(id, n - 1); } } });
        })));
      }
      box.appendChild(row);
    });
  }
  /* put a receiver at read n (0, 1, 2); tapping his own number takes it away */
  function setRead(id, n) {
    var p = P(); save();
    var t = p.targets.filter(function (x) { return x !== id; });
    if (p.targets[n] === id) p.targets = t;
    else { t.splice(Math.min(n, t.length), 0, id); p.targets = t.slice(0, 3); }
    changed();
  }

  /* ---------- the card: what each player does, and where it goes in the book ---------- */
  var SITS = [['openers', 'Openers'], ['first10', '1st and 10'], ['second-long', '2nd and long'], ['second-short', '2nd and short'], ['short', '3rd/4th short'], ['medium', '3rd/4th medium'], ['long', '3rd/4th long'], ['redzone', 'Red zone'], ['goalline', 'Goal line'], ['twominute', '2 minute'], ['backedup', 'Backed up']];
  function renderCard() {
    var box = $('sCard'); if (sideTab !== 'card') return;
    box.innerHTML = '';
    var C = window.FAW_CARDS, e = entry(), back = null;
    if (C && C.back) { try { back = C.back(P(), { stats: e && e.stats && e.stats[e.distance] ? e.stats[e.distance].test : null, terms: A.terms() }); } catch (err) { back = null; } }
    if (back) {
      box.appendChild(el('div', { class: 'cardback' }, [
        el('ul', {}, back.lines.map(function (l) { return el('li', {}, [el('b', { text: l.who }), ' ' + l.text]); })),
        back.qb ? el('p', { text: back.qb }) : null
      ]));
    }
    var notes = el('textarea', { rows: '3', maxlength: '500', placeholder: 'Coaching points: read the flat defender' });
    notes.value = A.draft.notes || '';
    notes.addEventListener('input', function () { A.draft.notes = notes.value; A.saveDraft(); var e2 = entry(); if (e2) { e2.notes = notes.value; saveSoon(); } });
    box.appendChild(el('label', { class: 'field' }, [el('span', { text: 'Coaching points' }), notes]));
    box.appendChild(el('h3', { text: 'Situations' }));
    var sits = A.draft.situations || (A.draft.situations = []);
    box.appendChild(el('div', { class: 'chips' }, SITS.map(function (s) {
      return el('button', { type: 'button', 'aria-pressed': String(sits.indexOf(s[0]) >= 0), text: s[1], on: { click: function () {
        var i = sits.indexOf(s[0]); if (i >= 0) sits.splice(i, 1); else sits.push(s[0]);
        A.saveDraft(); var e3 = entry(); if (e3) { e3.situations = sits.slice(); saveSoon(); } renderCard();
      } } });
    })));
    if (e) {
      var b = book();
      box.appendChild(el('label', { class: 'field' }, [el('span', { text: 'Section in ' + b.name }), A.select(b.sections.map(function (s) { return [s.id, s.name]; }), e.section, function (v) { e.section = v; saveSoon(); })]));
      if (e.num != null) box.appendChild(el('p', { class: 'help', text: 'Play number ' + e.num + ' in ' + b.name + '.' }));
    }
  }

  /* ---------- play settings ---------- */
  function motionPts(id, type) {
    var a = O()[id], o = a[0] < -0.3 ? -1 : 1, y = Math.min(a[1], -1.2);
    if (type === 'jet') return [[-o * 2, -2.4]];
    if (type === 'orbit') return [[a[0] * 0.45, -4.5], [-o * 3, -6]];
    if (type === 'zip') return [[a[0] - o * 4.5, y]];
    return [[a[0] - o * 5, y], [a[0] - o * 1.5, y]];
  }
  function setMotion(id, type) {
    var p = P(); save();
    var old = p.motion, oldEnd = old ? snapSpot(old.who) : null;
    if (old) { var r0 = routeOf(old.who); if (r0) { var a0 = O()[old.who], dx0 = a0[0] - oldEnd[0], dy0 = a0[1] - oldEnd[1]; r0.pts = r0.pts.map(function (q) { return [q[0] + dx0, q[1] + dy0]; }); } }
    p.motion = null;
    if (id) {
      p.motion = { who: id, type: type, pts: motionPts(id, type) };
      var r = routeOf(id), a = O()[id], end = p.motion.pts[p.motion.pts.length - 1];
      if (r) { var dx = end[0] - a[0], dy = end[1] - a[1]; r.pts = r.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; }); }
    }
    changed();
  }
  function motionWhoOpts() { return F.ELIGIBLE.filter(function (id) { return !F.isBackfield(O()[id]) || id === 'RB'; }).map(function (id) { return [id, WHO[id]]; }); }
  $('sMotion').addEventListener('change', function () {
    if (this.checked) {
      var opts = motionWhoOpts(); A.fill($('sMotionWho'), opts, P().routes.length ? (opts.filter(function (o) { return o[0] === 'SLOT'; })[0] || opts[0])[0] : opts[0][0]);
      setMotion($('sMotionWho').value, $('sMotionType').value);
    } else setMotion(null);
  });
  $('sMotionWho').addEventListener('change', function () { setMotion(this.value, $('sMotionType').value); });
  $('sMotionType').addEventListener('change', function () { if (P().motion) setMotion(P().motion.who, this.value); });
  $('sPA').addEventListener('change', function () { save(); P().playAction = this.checked || undefined; if (!this.checked) delete P().playAction; changed(); });
  $('sShowD').addEventListener('change', function () { setView(this.checked ? 'both' : 'offense'); });
  function setView(v) {
    view = v;
    Array.prototype.forEach.call(document.querySelectorAll('#sView button'), function (b) { b.classList.toggle('on', b.dataset.v === v); });
    $('sCall').hidden = v === 'offense'; $('sShowD').checked = v !== 'offense';
    draw();
  }
  Array.prototype.forEach.call(document.querySelectorAll('#sView button'), function (b) { b.addEventListener('click', function () { setView(b.dataset.v); }); });
  A.fill($('sCall'), E.CALL_KEYS.map(function (k) { return [k, 'vs ' + A.CALL_LABEL[k]]; }), call);
  $('sCall').addEventListener('change', function () { call = this.value; draw(); });

  /* ---------- the tools ---------- */
  var HINTS = { move: 'Drag the QB or a receiver to line him up.', route: 'Drag from a receiver to draw his route.', block: 'Drag a short bar from a receiver or back.',
    handoff: 'Tap the QB, then the back who gets it.', read: 'Tap receivers in the order the QB reads them: 1st, 2nd, 3rd.', motion: 'Drag from a receiver along the line: his motion before the snap.', erase: 'Tap a player to clear what he was given.' };
  function hint(t) { $('sHint').textContent = t == null ? HINTS[tool] : t; }
  function setTool(t) {
    tool = t; armed = false;
    Array.prototype.forEach.call(document.querySelectorAll('#sTools [data-tool]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
    hint(); draw();
  }
  Array.prototype.forEach.call(document.querySelectorAll('#sTools [data-tool]'), function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
  $('sUndo').addEventListener('click', function () { if (!undo.length) return; A.draft.play = JSON.parse(undo.pop()); changed(); });
  $('sClear').addEventListener('click', function () { save(); var p = P(), np = A.emptyPlay(p.formation); np.moved = p.moved; if (p.customFormation) np.customFormation = p.customFormation; A.draft.play = np; changed(); });
  $('sFlip').addEventListener('click', function () { save(); A.draft.play = flip(P()); changed(); A.toast('sToast', 'Flipped.'); });

  /* mirror the whole play: every spot, route, block, run and motion */
  function flip(p) {
    var C = window.FAW_CARDS;
    if (C && C.flipPlay) return C.flipPlay(p);
    var q = A.copy(p), O2 = F.place(p.formation, p.moved), m = function (pt) { return [-pt[0], pt[1]]; };
    q.moved = {}; F.EDITABLE.forEach(function (id) { q.moved[id] = m(O2[id]); });
    q.routes = (p.routes || []).map(function (r) { var x = A.copy(r); x.pts = r.pts.map(m); return x; });
    q.blocks = (p.blocks || []).map(function (b) { return { who: b.who, to: m(b.to) }; });
    if (p.handoff) q.handoff = { to: p.handoff.to, path: (p.handoff.path || []).map(m) };
    if (p.motion) q.motion = { who: p.motion.who, type: p.motion.type, pts: p.motion.pts.map(m) };
    delete q.customFormation;
    return q;
  }

  function hit(pt, ids) {
    var O2 = O(), best = null, bd = 1.8;
    ids.forEach(function (id) { var a = id === 'QB' ? O2[id] : snapSpot(id), d = len(a[0] - pt[0], a[1] - pt[1]); if (d < bd) { bd = d; best = id; } });
    /* the aligned spot of a motion man counts too */
    if (!best && P().motion) { var a2 = O2[P().motion.who]; if (len(a2[0] - pt[0], a2[1] - pt[1]) < 1.8) best = P().motion.who; }
    return best;
  }
  function routeEndNear(pt) {
    var p = P();
    for (var i = 0; i < p.routes.length; i++) { var e = p.routes[i].pts[p.routes[i].pts.length - 1]; if (len(e[0] - pt[0], e[1] - pt[1]) < 1.6) return p.routes[i].who; }
    if (isRun() && p.handoff.path && p.handoff.path.length) { var e2 = p.handoff.path[p.handoff.path.length - 1]; if (len(e2[0] - pt[0], e2[1] - pt[1]) < 1.6) return '#path'; }
    return null;
  }
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var dmax = 0, idx = 0, a = pts[0], b = pts[pts.length - 1];
    for (var i = 1; i < pts.length - 1; i++) {
      var dx = b[0] - a[0], dy = b[1] - a[1], L = len(dx, dy) || 1;
      var d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps) return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps));
    return [a, b];
  }
  function clampPt(q) { return [Math.max(-25.5, Math.min(25.5, q[0])), Math.max(-12, Math.min(50, q[1]))]; }

  canvas.addEventListener('pointerdown', function (ev) {
    /* a second finger is ignored; a new press always ends a drag whose lift was lost */
    if (!V || ev.isPrimary === false) return;
    var pt = V.toRel(ev.clientX, ev.clientY);
    drag = { id: ev.pointerId, start: pt, who: hit(pt, F.EDITABLE), kind: null, pts: null, moved: false };
    canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var pt = V.toRel(ev.clientX, ev.clientY), far = len(pt[0] - drag.start[0], pt[1] - drag.start[1]) * V.scale();
    if (!drag.moved && far > 6) { drag.moved = true; begin(); }
    if (drag.kind === 'move') {
      var O2 = O(), np = [Math.max(-24, Math.min(24, pt[0])), Math.min(-0.6, Math.max(-11, pt[1]))];
      var clash = Object.keys(O2).some(function (id) { return id !== drag.who && len(O2[id][0] - np[0], O2[id][1] - np[1]) < 1.5; });
      if (!clash) {
        var old = O2[drag.who], dx = np[0] - old[0], dy = np[1] - old[1], p = P();
        p.moved[drag.who] = np;
        var r = routeOf(drag.who); if (r && !(p.motion && p.motion.who === drag.who)) r.pts = r.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
        var b = blockOf(drag.who); if (b) b.to = [b.to[0] + dx, b.to[1] + dy];
        if (isRun() && p.handoff.to === drag.who) p.handoff.path = p.handoff.path.map(function (q) { return [q[0] + dx, q[1] + dy]; });
        delete p.customFormation;
      }
      draw(); return;
    }
    if (drag.pts) {
      var last = drag.pts[drag.pts.length - 1], q2 = clampPt(pt);
      if (drag.kind === 'motion') q2[1] = Math.min(-0.6, q2[1]);
      if (len(q2[0] - last[0], q2[1] - last[1]) > 0.35) drag.pts.push(q2);
      draw();
    }
  });
  function begin() {
    var O2 = O(), p = P();
    if (tool === 'move') { if (drag.who) { drag.kind = 'move'; save(); } return; }
    if (tool === 'route' || tool === 'handoff') {
      var endOf = routeEndNear(drag.start), carrier = isRun() ? p.handoff.to : null;
      if (drag.who && drag.who === carrier) { drag.kind = 'path'; drag.extend = false; drag.pts = [O2[drag.who]]; return; }
      if (!drag.who && endOf === '#path') { drag.kind = 'path'; drag.extend = true; drag.pts = [p.handoff.path[p.handoff.path.length - 1]]; return; }
      if (tool === 'handoff') return;
      if (drag.who && drag.who !== 'QB') { drag.kind = 'route'; drag.extend = false; drag.pts = [snapSpot(drag.who)]; return; }
      if (!drag.who && endOf && endOf !== '#path') { drag.who = endOf; drag.kind = 'route'; drag.extend = true; var r = routeOf(endOf); drag.pts = [r.pts[r.pts.length - 1]]; return; }
    }
    if (tool === 'block' && drag.who && drag.who !== 'QB') { drag.kind = 'block'; drag.pts = [snapSpot(drag.who)]; return; }
    if (tool === 'motion' && drag.who && drag.who !== 'QB') { drag.kind = 'motion'; drag.pts = [O2[drag.who]]; }
  }
  canvas.addEventListener('pointerup', function (ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (d.kind === 'move') { hint(); changed(); return; }
    if (!d.moved) { tap(d.who); return; }
    if (!d.pts || d.pts.length < 2) { draw(); return; }
    var pts = simplify(d.pts, 0.8).slice(1), total = 0, prev = d.pts[0];
    pts.forEach(function (q) { total += len(q[0] - prev[0], q[1] - prev[1]); prev = q; });
    if (total < 1.2) { draw(); return; }
    var p = P(); save();
    if (d.kind === 'route') {
      var r = routeOf(d.who);
      p.blocks = p.blocks.filter(function (b) { return b.who !== d.who; });
      if (d.extend && r) { r.pts = r.pts.concat(pts).slice(0, 8); delete r.type; delete r.depth; }
      else { p.routes = p.routes.filter(function (x) { return x.who !== d.who; }); p.routes.push({ who: d.who, pts: pts.slice(0, 6) }); }
      if (!p.targets.length && !isRun()) p.targets.push(d.who);
      hint(isRun() ? '' : 'Use Read to set the 1st, 2nd and 3rd read.');
    } else if (d.kind === 'path') {
      p.handoff.path = d.extend ? p.handoff.path.concat(pts).slice(0, 8) : pts.slice(0, 6);
    } else if (d.kind === 'block') {
      var a = d.pts[0], e = d.pts[d.pts.length - 1], dx = e[0] - a[0], dy = e[1] - a[1], L = len(dx, dy), k = L > 3.5 ? 3.5 / L : 1;
      p.blocks = p.blocks.filter(function (b) { return b.who !== d.who; });
      p.routes = p.routes.filter(function (x) { return x.who !== d.who; });
      p.blocks.push({ who: d.who, to: [a[0] + dx * k, a[1] + dy * k] });
    } else if (d.kind === 'motion') {
      var old = p.motion; if (old && old.who !== d.who) p.motion = null;
      var a2 = O()[d.who], end = pts[pts.length - 1], r2 = routeOf(d.who);
      var prevEnd = old && old.who === d.who ? old.pts[old.pts.length - 1] : a2;
      if (r2) { var mx = end[0] - prevEnd[0], my = end[1] - prevEnd[1]; r2.pts = r2.pts.map(function (q) { return [q[0] + mx, q[1] + my]; }); }
      p.motion = { who: d.who, pts: pts.slice(0, 4) };
    }
    changed();
  });
  canvas.addEventListener('pointercancel', function (ev) { if (drag && ev.pointerId === drag.id) { drag = null; draw(); } });

  function tap(who) {
    var p = P();
    if (tool === 'handoff') {
      if (!armed && who === 'QB') { armed = true; hint('Now tap the back who gets it. Tap the QB again to keep it.'); draw(); return; }
      if (armed && who) {
        save(); armed = false;
        var at = O()[who];
        p.handoff = { to: who, path: [[at[0], Math.max(4, at[1] + 6)]] };
        p.targets = []; delete p.playAction;
        p.blocks = p.blocks.filter(function (b) { return b.who !== who; });
        p.routes = p.routes.filter(function (r) { return r.who !== who; });
        hint('It is a run. Drag from ' + (who === 'QB' ? 'the QB' : 'him') + ' to draw the path.');
        changed(); return;
      }
      if (!armed && who && isRun() && p.handoff.to === who) { save(); p.handoff = null; hint('Back to a pass.'); changed(); return; }
      armed = false; hint('Tap the QB first.'); draw(); return;
    }
    if (tool === 'read') {
      if (isRun()) { hint('A run has no reads.'); return; }
      if (!who || who === 'QB') return;
      if (!routeOf(who)) { hint('Give him a route first.'); return; }
      save();
      var i = p.targets.indexOf(who);
      if (i >= 0) p.targets.splice(i, 1);
      else if (p.targets.length < 3) p.targets.push(who);
      else { hint('Three reads is the most. Tap one to take it away.'); return; }
      hint(p.targets.length ? 'Reads: ' + p.targets.map(function (x, k) { return (k + 1) + ' ' + WHO[x]; }).join(', ') + '.' : HINTS.read);
      changed(); return;
    }
    if (tool === 'erase' && who) {
      save();
      p.routes = p.routes.filter(function (r) { return r.who !== who; });
      p.blocks = p.blocks.filter(function (b) { return b.who !== who; });
      p.targets = p.targets.filter(function (x) { return x !== who; });
      if (p.motion && p.motion.who === who) p.motion = null;
      if (isRun() && p.handoff.to === who) p.handoff = null;
      changed(); return;
    }
    if (who && tool === 'route') hint(who === 'QB' ? 'The QB throws. Use Run to make it a run.' : 'Drag from him to draw his route.');
    if (who && tool === 'block') hint('Drag a short bar from him.');
  }

  /* ---------- out of the Studio ---------- */
  $('sRun').addEventListener('click', function () { A.runChoice = 'draft'; A.show('play'); if (window.FAW_GAME) window.FAW_GAME.run(); });
  $('sTest').addEventListener('click', function () { A.testChoice = 'draft'; A.show('test'); });
  $('sDownload').addEventListener('click', function () {
    var c = document.createElement('canvas'); c.width = 1400; c.style.width = '1400px';
    var sc = A.SC, Y0 = 100 - sc.ballOn, W2 = T.view(c, { BX: sc.ballX, Y0: Y0, marker: Math.min(100, Y0 + sc.distance), behind: 11, ahead: 27 });
    W2.layout(1400);
    W2.field().play(P(), { distance: sc.distance, depths: true });
    var x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0);
    var a = document.createElement('a'); a.download = (A.draft.name || 'play').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png'; a.href = c.toDataURL('image/png'); a.click();
  });

  /* open a playbook play in the Studio */
  function open(bookId, playId) {
    var b = A.store.book(bookId), e = null; if (!b) return;
    b.plays.forEach(function (p) { if (p.id === playId) e = p; });
    if (!e) return;
    A.setDraft({ play: A.copy(e.play), name: e.name, nameEdited: !!e.nameEdited, tag: e.tag || A.tagOf(e.play), fav: !!e.fav, notes: e.notes || '', situations: (e.situations || []).slice(), ref: { book: b.id, id: e.id } });
    if (e.distance) A.SC.distance = e.distance;
    undo = [];
    A.show('studio');
  }
  function newPlay() {
    A.setDraft({ play: A.emptyPlay('gun3x1'), name: '', nameEdited: false, tag: 'pass', fav: false, notes: '', situations: [], ref: null });
    undo = [];
  }

  A.on('studio', function () { layout(); renderLib(); renderPlayers(); renderCard(); renderBar(); name(); hint(); });
  A.on('remote', function () { if (A.current() === 'studio') { renderBar(); renderLib(); } });
  window.addEventListener('resize', function () { if (A.current() === 'studio') layout(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (A.current() === 'studio') draw(); });

  window.FAW_STUDIO = {
    open: open, newPlay: newPlay, setTool: setTool, flip: flip, giveRoute: giveRoute, setRead: setRead,
    play: function () { return A.copy(P()); }, toScreen: function (q) { return V.toScreen(q); }, view: function () { return V; }
  };
})();
