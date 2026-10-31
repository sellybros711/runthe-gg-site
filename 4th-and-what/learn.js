/* 4th and What: Learn, the playbook for the players.
 *
 * Pick a playbook (or the concept library) and a play, then a position.
 * Four steps, as on the owner's template:
 *   Learn     watch it with your man lit up, and read your job
 *   Practice  the questions, with the answers drawn on the field
 *   Quiz      the same five questions with the field bare
 *   Master    five for five in the quiz
 * Questions come from the play itself: your assignment, the depth of your
 * break, which read you are, the play's name, and the formation. Every
 * number in them is read off the drawn play.
 *
 * Progress is kept in this browser for now. Team quizzes, assignments and
 * practice results are the next build (the owner, 2026-10-31).
 *
 * Plain script: window.FAW_LEARN (for the checks).
 */
(function () {
  'use strict';
  var A = window.FAW_APP, E = window.FAW_ENGINE, F = window.FAW_FORMATIONS, N = window.FAW_NAMES, T = window.FAW_TURF, R = window.FAW_ROUTES;
  var $ = function (id) { return document.getElementById(id); }, el = A.el;
  var POS = [['WR1', 'X'], ['WR2', 'Z'], ['SLOT', 'H'], ['TE', 'Y'], ['RB', 'RB'], ['QB', 'QB']];
  var V = null, sel = null, step = 'learn', qi = 0, score = 0, anim = null, raf = 0, last = 0, t = 0;
  var PROG_KEY = 'faw_learn_v1';

  function prog() { try { return JSON.parse(localStorage.getItem(PROG_KEY) || '{}'); } catch (e) { return {}; } }
  function setProg(k, v) { var p = prog(); p[k] = v; try { localStorage.setItem(PROG_KEY, JSON.stringify(p)); } catch (e) {} }
  function progKey() { return sel ? sel.key + '|' + $('lWho').value : ''; }

  /* ---------- what a player does, in words ---------- */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function routeOf(play, id) { var r = null; (play.routes || []).forEach(function (x) { if (x.who === id) r = x; }); return r; }
  function blockOf(play, id) { var r = null; (play.blocks || []).forEach(function (x) { if (x.who === id) r = x; }); return r; }
  function typeOf(play, id) {
    var r = routeOf(play, id); if (!r) return null;
    var O = F.place(play.formation, play.moved), m = play.motion && play.motion.who === id && play.motion.pts.length ? play.motion.pts[play.motion.pts.length - 1] : O[id];
    return E.routeName(m, r.pts);
  }
  function job(play, id) {
    var run = !!(play.handoff && play.handoff.to);
    if (id === 'QB') {
      if (run) return play.handoff.to === 'QB' ? 'Keep it and run' : 'Hand it to the ' + (T.LABEL[play.handoff.to] || play.handoff.to);
      var t1 = play.targets || [];
      return t1.length ? 'Read the ' + t1.map(function (x) { return T.LABEL[x]; }).join(', then the ') : 'Throw it';
    }
    if (run && play.handoff.to === id) return 'Take the handoff';
    if (blockOf(play, id)) return run ? 'Lead block' : 'Stay in and block';
    var ty = typeOf(play, id);
    if (ty) return 'Run a ' + (N.ROUTE_LABEL[ty] || ty).toLowerCase() + ' route';
    return 'Get open underneath';
  }
  function depthOf(play, id) { var r = routeOf(play, id); return r && r.pts.length ? Math.max(1, Math.round(r.pts[0][1])) : null; }
  function pick(list, n, seed, keep) {
    var out = keep ? [keep] : [], pool = list.filter(function (x) { return x !== keep; }), s = seed;
    while (out.length < n && pool.length) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; out.push(pool.splice(s % pool.length, 1)[0]); }
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    for (var i = out.length - 1; i > 0; i--) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; var j = s % (i + 1), x = out[i]; out[i] = out[j]; out[j] = x; }
    return out;
  }
  function questions(play, id, names) {
    var seed = hash(JSON.stringify(play) + id), qs = [];
    var right = job(play, id);
    var cards = window.FAW_CARDS, cq = null;
    if (cards && cards.quiz) { try { cq = cards.quiz(play, id); } catch (e) { cq = null; } }
    if (cq && cq.choices && cq.choices.length) { var ca = typeof cq.answer === 'number' ? cq.choices[cq.answer] : cq.answer; qs.push({ q: 'What is your assignment?', options: cq.choices, answer: ca, why: 'The ' + T.LABEL[id] + ': ' + ca.charAt(0).toLowerCase() + ca.slice(1) + '.' }); }
    else {
      var wrongs = ['Run a go route', 'Run a slant route', 'Run a flat route', 'Run a curl route', 'Run a post route', 'Stay in and block', 'Run a dig route', 'Take the handoff', 'Run a corner route', 'Lead block'];
      qs.push({ q: 'What is your assignment?', options: pick(wrongs, 4, seed, right), answer: right, why: 'The ' + T.LABEL[id] + ': ' + right + '.' });
    }
    var dep = depthOf(play, id);
    if (dep != null && id !== 'QB') {
      var ds = [dep, dep + 2, Math.max(1, dep - 2), dep + 5].map(function (x) { return x + ' yards'; });
      qs.push({ q: 'How deep is your break?', options: pick(ds, 4, seed + 1, dep + ' yards'), answer: dep + ' yards', why: 'Your route breaks at ' + dep + ' yards past the line.' });
    }
    if (!(play.handoff && play.handoff.to)) {
      var tg = play.targets || [];
      if (id === 'QB') {
        if (tg.length) {
          var first = T.LABEL[tg[0]], opts = ['X', 'Z', 'H', 'Y', 'RB'].filter(function (x) { return x !== first; });
          qs.push({ q: 'Who is your 1st read?', options: pick(opts, 3, seed + 2).concat([first]).sort(), answer: first, why: 'The ' + first + ' is the 1st read.' });
        }
      } else if (routeOf(play, id)) {
        var i = tg.indexOf(id), ans = i === 0 ? '1st read' : i === 1 ? '2nd read' : i === 2 ? '3rd read' : 'Not a read';
        qs.push({ q: 'Which read are you?', options: ['1st read', '2nd read', '3rd read', 'Not a read'], answer: ans, why: i >= 0 ? 'You are the ' + ans + '. The last read is the checkdown when the pocket goes.' : 'The QB is not reading you. Run it hard: you clear space.' });
      }
    }
    var nm = sel.name, others = names.filter(function (x) { return x !== nm; });
    if (others.length >= 2) qs.push({ q: 'What is this play called?', options: pick(others, 3, seed + 3).concat([nm]).sort(), answer: nm, why: 'This is ' + nm + '.' });
    var fw = N.FORMATION_WORD[play.formation] || play.formation, fws = F.SETS.map(function (s) { return N.FORMATION_WORD[s.id] || s.name; });
    qs.push({ q: 'What formation is this?', options: pick(fws, 4, seed + 4, fw), answer: fw, why: 'It is ' + fw + '.' });
    return qs.slice(0, 5);
  }

  /* ---------- the plays to learn ---------- */
  function sources() {
    var out = [];
    if (A.signedIn() && A.store.ready()) A.store.books().forEach(function (b) { out.push({ id: b.id, name: b.name, plays: b.plays.map(function (p) { return { key: b.id + ':' + p.id, name: p.name, play: p.play, tag: p.tag || A.tagOf(p.play) }; }) }); });
    out.push({ id: 'concepts', name: 'Concept library', plays: R.CONCEPTS.map(function (c) { return { key: 'c:' + c.name, name: c.name, play: R.apply(A.emptyPlay(c.kind === 'run' ? 'iform' : 'gun3x1'), c.name), tag: c.kind }; }) });
    return out;
  }
  function renderTree() {
    var src = sources(), bookId = $('lBook').value;
    A.fill($('lBook'), src.map(function (s) { return [s.id, s.name]; }), bookId && src.some(function (s) { return s.id === bookId; }) ? bookId : (A.learnChoice ? A.learnChoice.book : src[0].id));
    var s = src.filter(function (x) { return x.id === $('lBook').value; })[0] || src[0];
    if (A.learnChoice) { var w = A.learnChoice.book + ':' + A.learnChoice.play; s.plays.forEach(function (p) { if (p.key === w) sel = p; }); A.learnChoice = null; }
    if (!sel || !s.plays.some(function (p) { return p.key === sel.key; })) sel = s.plays[0] || null;
    var box = $('lTree'); box.innerHTML = '';
    box.className = 'tree';
    box.appendChild(el('button', { type: 'button', class: 'node', disabled: 'disabled' }, [el('span', { text: 'All plays' }), el('small', { text: String(s.plays.length) })]));
    var P = prog(), who = $('lWho').value;
    ['pass', 'run', 'rpo', 'special'].forEach(function (tag) {
      var list = s.plays.filter(function (p) { return p.tag === tag; });
      if (!list.length) return;
      box.appendChild(el('button', { type: 'button', class: 'node', disabled: 'disabled' }, [el('span', { text: tag === 'rpo' ? 'RPO' : tag.charAt(0).toUpperCase() + tag.slice(1) }), el('small', { text: String(list.length) })]));
      list.forEach(function (p) {
        var done = P[p.key + '|' + who] === 'master';
        box.appendChild(el('button', { type: 'button', class: 'node sub' + (sel && sel.key === p.key ? ' on' : ''), 'data-key': p.key, on: { click: function () { sel = p; step = 'learn'; qi = 0; score = 0; renderTree(); renderPlay(); } } }, [el('span', { text: p.name }), el('small', { text: done ? '✓' : '' })]));
      });
    });
  }
  $('lBook').addEventListener('change', function () { sel = null; renderTree(); renderPlay(); });
  A.fill($('lWho'), POS, 'TE');
  $('lWho').addEventListener('change', function () { step = 'learn'; qi = 0; score = 0; renderTree(); renderPlay(); });
  Array.prototype.forEach.call(document.querySelectorAll('#lSteps li'), function (li) { li.addEventListener('click', function () { step = li.dataset.step; qi = 0; score = 0; renderPlay(); }); });
  ['lRoutes', 'lAssign'].forEach(function (id) { $(id).addEventListener('change', function () { drawStill(); }); });

  /* ---------- the field ---------- */
  function layout() {
    if (!V) V = T.view($('lField'), {});
    var Y0 = 50; V.set({ BX: E.FIELD_W / 2, Y0: Y0, marker: null, behind: 11, ahead: 25 , across: T.across() }); V.layout();
  }
  function drawStill() {
    if (!sel || !V) return;
    var who = $('lWho').value, showR = $('lRoutes').checked, bare = step === 'quiz';
    var p = A.copy(sel.play);
    if (!showR || bare) { p.routes = p.routes.filter(function (r) { return r.who === who && !bare; }); p.blocks = p.blocks.filter(function (b) { return b.who === who && !bare; }); if (bare) { p.handoff = null; delete p.motion; } }
    V.field().play(p, { highlight: who, reads: showR && !bare });
  }
  function animate() {
    if (!sel) return;
    cancelAnimationFrame(raf);
    var sc = A.copy(A.SC); sc.ballOn = 50; sc.distance = 10; sc.ballX = E.FIELD_W / 2;
    var pl = sel.play;
    if (!(pl.handoff && pl.handoff.to) && !(pl.targets && pl.targets.length)) { drawStill(); return; }
    anim = E.run(sc, pl, 1234, { call: 'cover3' });
    t = anim.pre && anim.pre.length ? anim.pre[0].t : 0; last = 0;
    var end = anim.frames[anim.frames.length - 1].t;
    (function tick(now) {
      if (now && last) t += (now - last) / 1000 * (+$('lSpeed').value || 1);
      last = now || 0;
      V.field(); V.frame(anim, Math.min(t, end), { play: $('lRoutes').checked ? sel.play : null, icons: true });
      if (t < end && A.current() === 'learn') raf = requestAnimationFrame(tick);
    })();
  }
  $('lAnim').addEventListener('click', animate);

  /* ---------- the steps ---------- */
  function renderPlay() {
    layout();
    var lis = document.querySelectorAll('#lSteps li'), order = ['learn', 'practice', 'quiz', 'master'], si = order.indexOf(step), P = prog(), k = progKey();
    Array.prototype.forEach.call(lis, function (li, i) { li.classList.toggle('on', i === si); li.classList.toggle('done', i < si || P[k] === 'master'); });
    $('lTitle').textContent = sel ? sel.name : 'Pick a play';
    $('lSub').textContent = sel ? (sel.tag === 'run' ? 'Run' : sel.tag === 'rpo' ? 'RPO' : 'Pass') + ' · ' + (N.FORMATION_WORD[sel.play.formation] || sel.play.formation) : '';
    drawStill();
    var box = $('lQuiz'); box.innerHTML = '';
    if (!sel) return;
    var who = $('lWho').value, label = T.LABEL[who] || who;
    if (step === 'learn') {
      box.appendChild(el('div', { class: 'q' }, [el('p', { class: 'qn', text: 'Your job' }), el('h4', {}, [el('span', { class: 'pchip', text: label, style: 'background:' + T.COLOR[who] }), job(sel.play, who)]),
        depthOf(sel.play, who) != null && who !== 'QB' ? el('p', { class: 'help', text: 'Break at ' + depthOf(sel.play, who) + ' yards.' }) : null,
        el('p', { class: 'help', text: 'Press Play Animation to watch it against Cover 3.' }),
        el('button', { type: 'button', class: 'btn gold', text: 'Practice it', on: { click: function () { step = 'practice'; qi = 0; score = 0; renderPlay(); } } })]));
      return;
    }
    if (step === 'master') {
      var m = P[k] === 'master';
      box.appendChild(el('div', { class: 'q' }, [el('h4', { text: m ? 'Mastered.' : 'Not yet.' }), el('p', { class: 'help', text: m ? 'Five for five on the quiz as the ' + label + '.' : 'Get five for five on the quiz to master it.' }),
        el('button', { type: 'button', class: 'btn gold', text: m ? 'Next play' : 'Take the quiz', on: { click: function () { if (m) nextPlay(); else { step = 'quiz'; qi = 0; score = 0; renderPlay(); } } } })]));
      return;
    }
    var names = []; sources().forEach(function (s) { if (s.id === $('lBook').value) s.plays.forEach(function (p) { names.push(p.name); }); });
    var qs = questions(sel.play, who, names);
    if (qi >= qs.length) {
      var all = score === qs.length;
      if (step === 'quiz' && all) setProg(k, 'master');
      box.appendChild(el('div', { class: 'q' }, [el('h4', { text: score + ' of ' + qs.length + '.' }),
        el('p', { class: 'help', text: step === 'practice' ? 'Now the quiz, with the field bare.' : all ? 'Five for five. Mastered.' : 'Go again. Five for five masters it.' }),
        el('button', { type: 'button', class: 'btn gold', text: step === 'practice' ? 'Take the quiz' : all ? 'Done' : 'Again', on: { click: function () { step = step === 'practice' ? 'quiz' : all ? 'master' : 'quiz'; qi = 0; score = 0; renderTree(); renderPlay(); } } })]));
      return;
    }
    var q = qs[qi], answered = false;
    var wrap = el('div', { class: 'q' }, [el('p', { class: 'qn', text: 'Question ' + (qi + 1) + ' of ' + qs.length }), el('h4', {}, [el('span', { class: 'pchip', text: label, style: 'background:' + T.COLOR[who] }), q.q])]);
    q.options.forEach(function (o, i) {
      var b = el('button', { type: 'button', class: 'opt' }, [el('i', { text: 'ABCD'.charAt(i) }), el('span', { text: o })]);
      b.addEventListener('click', function () {
        if (answered) return; answered = true;
        var ok = o === q.answer; if (ok) score++;
        b.classList.add(ok ? 'right' : 'wrong');
        if (!ok) Array.prototype.forEach.call(wrap.querySelectorAll('.opt'), function (x) { if (x.textContent.slice(1) === q.answer) x.classList.add('right'); });
        wrap.appendChild(el('div', { class: 'fb ' + (ok ? 'ok' : 'no'), text: (ok ? 'Correct. ' : 'Not quite. ') + q.why }));
        wrap.appendChild(el('button', { type: 'button', class: 'btn gold', text: 'Next', on: { click: function () { qi++; renderPlay(); } } }));
      });
      wrap.appendChild(b);
    });
    box.appendChild(wrap);
  }
  function nextPlay() {
    var s = sources().filter(function (x) { return x.id === $('lBook').value; })[0]; if (!s) return;
    var i = s.plays.map(function (p) { return p.key; }).indexOf(sel.key);
    sel = s.plays[(i + 1) % s.plays.length]; step = 'learn'; qi = 0; score = 0; renderTree(); renderPlay();
  }

  A.on('learn', function () { renderTree(); renderPlay(); });
  A.on('remote', function () { if (A.current() === 'learn') { renderTree(); renderPlay(); } });
  window.addEventListener('resize', function () { if (A.current() === 'learn') renderPlay(); });
  window.FAW_LEARN = { questions: questions, job: job, select: function (key) { sources().forEach(function (s) { s.plays.forEach(function (p) { if (p.key === key) { $('lBook').value = s.id; sel = p; } }); }); renderTree(); renderPlay(); } };
})();
