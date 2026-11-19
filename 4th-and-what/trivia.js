/* 4th and What: Daily Defense, the trivia.
 *
 * The owner, 2026-11-01: "Add a Daily trivia mode. It shows you a play and
 * you pick what defense you think covers it the best."
 *
 * One play a day, the same for everybody (the Eastern day, like the daily
 * 4th down): a concept from the route library on a formation, at a 4th down
 * distance picked from the day. You pick one of the seven calls. Then the
 * engine answers: it snaps the play SNAPS times against every call, with the
 * same seeds for each call (a forced call still rolls the call first, so the
 * dice after it fall the same way: a fair, paired comparison), and the call
 * that gave up the fewest first downs is the best. Calls within TIE of the
 * best are best too. Nothing about the answer is typed by hand: it is the
 * same sim the game plays, run when you lock in your pick, so a retune moves
 * the answer with it.
 *
 * Kept on this device: your pick and the rates, per day. No server.
 *
 * The node half (the pool and the day's play) is tested in
 * test/trivia.test.mjs.
 *
 * Plain script: window.FAW_TRIVIA in the page, module.exports in node.
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var req = function (n, g) { return root[g] || (typeof require === 'function' ? require(n) : null); };
  var RNG = req('./rng.js', 'FAW_RNG'), R = req('./routes.js', 'FAW_ROUTES'), F = req('./formations.js', 'FAW_FORMATIONS'),
    CARDS = req('./cards.js', 'FAW_CARDS'), E = req('./engine.js', 'FAW_ENGINE'), CFG = req('./config.js', 'FAW_CONFIG');

  var SNAPS = 100, TIE = 0.03, BALL_ON = 40;
  var DISTANCES = [2, 3, 4, 5, 6, 7, 8, 10];
  var CALLS = ['cover0', 'cover1', 'cover1b', 'cover2', 'cover2b', 'cover3', 'cover3b'];

  function emptyPlay(f) { return { formation: f, moved: {}, routes: [], blocks: [], handoff: null, targets: [] }; }
  /* every concept on every formation, both ways: the ones with a read or a run */
  var POOL = null;
  function pool() {
    if (POOL) return POOL;
    var list = [];
    F.SETS.forEach(function (s) {
      R.CONCEPTS.forEach(function (c) {
        if (c.run === 'sneak' && !s.under) return;
        var base = R.apply(emptyPlay(s.id), c.name);
        if (!((base.handoff && base.handoff.to) || base.targets.length)) return;
        list.push({ concept: c.name, kind: c.kind, set: s.id, setName: s.name, side: 'right', play: base });
        list.push({ concept: c.name, kind: c.kind, set: s.id, setName: s.name, side: 'left', play: CARDS.flipPlay(base) });
      });
    });
    /* a fixed shuffle, so the order never changes */
    var r = RNG.mulberry32(RNG.hashStr('faw-defense-pool-v1'));
    for (var j = list.length - 1; j > 0; j--) { var k = Math.floor(r() * (j + 1)), t = list[j]; list[j] = list[k]; list[k] = t; }
    return (POOL = list);
  }
  /* the day's question, from the schedule build/trivia.mjs wrote
     (data/defense.json): days that have a clear answer, in order */
  function entryFor(days, number) { var n = days.length; return days[((number - 1) % n + n) % n]; }
  function itemOf(entry) {
    var P = pool();
    for (var i = 0; i < P.length; i++) if (P[i].concept === entry.concept && P[i].set === entry.set && P[i].side === entry.side) return P[i];
    return null;
  }
  function distanceFor(day) { return DISTANCES[RNG.hashStr('faw-defense-distance-' + day) % DISTANCES.length]; }
  function scenarioFor(day, distance) {
    var o = JSON.parse(JSON.stringify(CFG.SCENARIO));
    o.down = 4; o.distance = distance || distanceFor(day); o.ballOn = BALL_ON; o.ballX = E.FIELD_W / 2;
    return o;
  }
  function seedsFor(day) { var a = []; for (var s = 1; s <= SNAPS; s++) a.push(RNG.hashStr('faw-defense-' + day + '-' + s)); return a; }

  /* how often each call gave up the first down, snap by snap so the page can
     yield between chunks. step() returns true when it is done. */
  function runner(sc, play, day) {
    var seeds = seedsFor(day), wins = {}, ci = 0, si = 0;
    CALLS.forEach(function (k) { wins[k] = 0; });
    return {
      total: CALLS.length * SNAPS,
      done: function () { return ci * SNAPS + si; },
      step: function (n) {
        while (n-- > 0 && ci < CALLS.length) {
          if (E.run(sc, play, seeds[si], { call: CALLS[ci] }).win) wins[CALLS[ci]]++;
          if (++si >= SNAPS) { si = 0; ci++; }
        }
        return ci >= CALLS.length;
      },
      rates: function () { var o = {}; CALLS.forEach(function (k) { o[k] = wins[k] / SNAPS; }); return o; }
    };
  }
  function solve(sc, play, day) { var r = runner(sc, play, day); r.step(1e9); return r.rates(); }
  /* the verdict on a pick: its rank (1 is the best), and whether it is a best call */
  function judge(rates, pick) {
    var best = Math.min.apply(null, CALLS.map(function (k) { return rates[k]; }));
    var rank = 1; CALLS.forEach(function (k) { if (rates[k] < rates[pick] - 0.005) rank++; });
    return { best: best, bestCalls: CALLS.filter(function (k) { return rates[k] <= best + TIE; }), correct: rates[pick] <= best + TIE, rank: rank };
  }

  var CORE = { SNAPS: SNAPS, TIE: TIE, CALLS: CALLS, DISTANCES: DISTANCES, pool: pool, entryFor: entryFor, itemOf: itemOf, distanceFor: distanceFor,
    scenarioFor: scenarioFor, seedsFor: seedsFor, runner: runner, solve: solve, judge: judge };
  if (isNode) { module.exports = CORE; return; }

  /* ================= the page ================= */
  var A = root.FAW_APP, T = root.FAW_TURF, D = root.FAW_DAILY;
  var $ = function (id) { return document.getElementById(id); }, el = A.el;
  var day = D.core.dayOf(), number = D.core.numberOf(day), KEY = 'faw_defense_' + day;
  var DATA = 'data/defense.json?v=3';
  var item = null, sc = null, V = null, busy = false;

  function kept() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function keep(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function streak() {
    /* best calls in a row, counted back from the last day played */
    var n = 0, d = new Date(day + 'T12:00:00Z');
    for (var i = 0; i < 400; i++) {
      var k = null; try { k = JSON.parse(localStorage.getItem('faw_defense_' + d.toISOString().slice(0, 10)) || 'null'); } catch (e) {}
      if (!k || !k.rates) { if (i === 0) { d.setUTCDate(d.getUTCDate() - 1); continue; } break; }
      if (!judge(k.rates, k.pick).correct) break;
      n++; d.setUTCDate(d.getUTCDate() - 1);
    }
    return n;
  }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function situation() { var s = A.sitText(sc); return s.down + ' · ' + s.spot; }

  function drawField() {
    if (!V) V = T.view($('tField'), {});
    V.set({ hash: root.FAW_CONFIG.level('nfl').hash, BX: sc.ballX, Y0: 100 - sc.ballOn, marker: 100 - sc.ballOn + sc.distance, behind: 10, ahead: window.innerWidth < 700 ? 22 : 18, across: T.across() });
    V.layout(); V.field(); V.play(item.play, { reads: true });
  }
  function render() {
    if (!item) { $('tSit').textContent = 'Loading today\'s play.'; return; }
    var k = kept();
    $('tNum').textContent = 'Daily Defense #' + number + ' · ' + D.core.dateText(day);
    $('tSit').textContent = situation() + '. They line up and run this.';
    $('tName').textContent = item.concept + ' · ' + item.setName + ' ' + (item.side === 'right' ? 'Right' : 'Left');
    drawField();
    var box = $('tCalls'); box.innerHTML = '';
    CALLS.forEach(function (c) {
      var bt = el('button', { type: 'button', class: 'tcall', 'data-call': c, 'aria-pressed': String(!!(k && k.pick === c)), 'aria-label': A.CALL_LABEL[c],
        disabled: k || busy ? 'disabled' : null, on: { click: function () { lock(c); } } });
      /* THE CALL, DRAWN (2026-11-19): its shell and its rush over the X's, then its name */
      bt.innerHTML = callArt(c) + '<span class="tlab">' + A.CALL_LABEL[c].replace(/ (zone|man|blitz)$/, '') + '<small>' + A.CALL_LABEL[c].split(' ').pop() + '</small></span>';
      box.appendChild(bt);
    });
    $('tAsk').hidden = !!k;
    if (k && k.rates) reveal(k); else $('tRes').hidden = true;
  }
  /* a call's picture: the deep zones shaded (two halves, three thirds, one middle), man as dashed
     lines to the receivers, the rush as red arrows, five X's. Decoration: the engine decides. */
  function callArt(c) {
    var deep = c.indexOf('cover2') === 0 ? 2 : c.indexOf('cover3') === 0 ? 3 : c.indexOf('cover1') === 0 ? 1 : 0;
    var man = c === 'cover0' || c.indexOf('cover1') === 0, rush = c === 'cover0' ? 3 : /b$/.test(c) ? 2 : 0;
    var z = '', i, w;
    if (deep) { w = deep === 1 ? 92 : 164 / deep; for (i = 0; i < deep; i++) { var x0 = deep === 1 ? 40 : 4 + i * w; z += '<path d="M' + x0 + ' 40 Q' + (x0 + w / 2) + ' 4 ' + (x0 + w) + ' 40Z" fill="rgba(73,163,255,.22)" stroke="#49a3ff" stroke-width="1.5"/>'; } }
    var m = man ? '<g stroke="#ffe36b" stroke-width="1.6" stroke-dasharray="3 3"><path d="M22 56 L18 74"/><path d="M150 56 L156 74"/><path d="M64 58 L60 74"/><path d="M110 58 L114 74"/></g>' : '';
    var r = ''; for (i = 0; i < rush; i++) { var x = 66 + i * 20; r += '<path d="M' + x + ' 58 L' + (x + 3) + ' 72" stroke="#ff6b5a" stroke-width="2.4"/><path d="M' + (x - 1) + ' 71 l4 5 3 -6z" fill="#ff6b5a"/>'; }
    var xs = ''; [22, 64, 86, 110, 150].forEach(function (x, k) { var y = 50 + (k % 2) * 4; xs += '<path d="M' + (x - 4) + ' ' + y + ' l8 8 m0 -8 l-8 8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'; });
    return '<svg class="tart" viewBox="0 0 172 82" aria-hidden="true"><line x1="0" y1="78" x2="172" y2="78" stroke="#4aa3ff" stroke-width="2"/>' + z + m + r + xs + '</svg>';
  }
  function lock(c) {
    if (busy || kept()) return;
    busy = true;
    Array.prototype.forEach.call(document.querySelectorAll('.tcall'), function (b) { b.disabled = true; b.setAttribute('aria-pressed', String(b.dataset.call === c)); });
    var run = runner(sc, item.play, day), bar = $('tProg');
    bar.hidden = false;
    (function chunk() {
      var done = run.step(35);
      $('tProgBar').style.width = Math.round(run.done() * 100 / run.total) + '%';
      $('tProgTxt').textContent = 'Running it ' + run.total + ' times. ' + SNAPS + ' snaps against every call.';
      if (!done) { setTimeout(chunk, 0); return; }
      bar.hidden = true; busy = false;
      var k = { pick: c, rates: run.rates() };
      keep(k); render();
    })();
  }
  function reveal(k) {
    var j = judge(k.rates, k.pick), box = $('tBars');
    $('tRes').hidden = false;
    $('tVerdict').textContent = j.correct ? 'Best call.' : 'Not the best call.';
    $('tVerdict').className = j.correct ? 'win' : 'lose';
    var bestName = j.bestCalls.map(function (c) { return A.CALL_LABEL[c]; }).join(' or ');
    $('tLine').textContent = A.CALL_LABEL[k.pick] + ' gave up ' + pct(k.rates[k.pick]) + '. ' +
      (j.correct ? 'Rank ' + j.rank + ' of ' + CALLS.length + '.' : 'Best was ' + bestName + ' at ' + pct(j.best) + '.');
    var s = streak(); $('tStreak').textContent = s ? 'Best calls in a row: ' + s : ''; $('tStreak').hidden = !s;
    box.innerHTML = '';
    CALLS.slice().sort(function (a, b) { return k.rates[a] - k.rates[b]; }).forEach(function (c) {
      var row = el('div', { class: 'tbar' + (c === k.pick ? ' mine' : '') + (j.bestCalls.indexOf(c) >= 0 ? ' best' : '') }, [
        el('span', { class: 'tl', text: A.CALL_LABEL[c] }),
        el('span', { class: 'tt' }, [el('i', {})]),
        el('b', { text: pct(k.rates[c]) })
      ]);
      row.querySelector('i').style.width = Math.max(2, Math.round(k.rates[c] * 100)) + '%';
      box.appendChild(row);
    });
  }
  function shareText() {
    var k = kept(); if (!k || !sc) return '';
    var j = judge(k.rates, k.pick), sq = '';
    for (var i = 1; i <= CALLS.length; i++) sq += i === j.rank ? (j.correct ? '🟩' : '🟨') : '⬜';
    return '4th and What Daily Defense #' + number + ' · ' + situation() + '\n' + sq + '\n' +
      (j.correct ? 'Best call' : 'My call ranked ' + j.rank + ' of ' + CALLS.length) + '\nhttps://runthe.gg/4th-and-what#trivia';
  }

  $('tShare').addEventListener('click', function () {
    root.FAW_SHARE.send(shareText()).then(function (how) { A.toast('tToast', how === 'copied' ? 'Copied. Paste it anywhere.' : how === 'shared' ? 'Shared.' : how === 'cancelled' ? '' : 'Could not share from here.'); });
  });
  /* watch the play against the call you picked, in the stadium */
  $('tWatch').addEventListener('click', function () {
    var k = kept(); if (!k) return;
    var res = E.run(sc, item.play, seedsFor(day)[0], { call: k.pick });
    A.watch3d(res, function () {});
  });
  $('tBack').addEventListener('click', function () { A.show('home'); });
  A.on('trivia', render);
  fetch(DATA).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.days || !d.days.length) return;
    var e = entryFor(d.days, number);
    item = itemOf(e); sc = scenarioFor(day, e.distance);
    if (A.current() === 'trivia') render();
  }).catch(function () {});
  window.addEventListener('resize', function () { if (A.current() === 'trivia') drawField(); });

  root.FAW_TRIVIA = { item: function () { return item; }, scenario: function () { return sc; }, kept: kept, judge: judge, core: CORE, share: shareText };
})(typeof window !== 'undefined' ? window : this);
