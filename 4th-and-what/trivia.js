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
  /* A CALL'S PICTURE (2026-11-19; redrawn the same day, the owner: "why do all the defenses look
     the same"). Each call is drawn from its real shape: who is deep (none, one, two halves, three
     thirds, shaded blue), man coverage as gold lines to the receivers, zones underneath as teal
     spots, and the rush as red arrows across the line. Decoration only: the engine decides. */
  var SHAPE = {
    cover0: { deep: [], man: [[14, 52], [40, 50], [132, 50], [158, 52]], zone: [], rush: [62, 86, 110] },
    cover1: { deep: [[86, 12]], man: [[14, 52], [40, 50], [132, 50], [158, 52]], zone: [], rush: [], lb: [[62, 40], [110, 40]] },
    cover1b: { deep: [[86, 12]], man: [[14, 52], [40, 50], [132, 50], [158, 52]], zone: [], rush: [62, 110] },
    cover2: { deep: [[44, 12], [128, 12]], man: [], zone: [[18, 46], [52, 40], [86, 40], [120, 40], [154, 46]], rush: [] },
    cover2b: { deep: [[44, 12], [128, 12]], man: [], zone: [[18, 46], [52, 40], [120, 40], [154, 46]], rush: [86] },
    cover3: { deep: [[24, 14], [86, 10], [148, 14]], man: [], zone: [[30, 42], [66, 40], [106, 40], [142, 42]], rush: [] },
    cover3b: { deep: [[24, 14], [86, 10], [148, 14]], man: [], zone: [[30, 42], [66, 40], [142, 42]], rush: [106] }
  };
  var RECV = [14, 40, 132, 158];
  function callArt(c) {
    var S = SHAPE[c] || SHAPE.cover2, o = '', i;
    var X = function (x, y, col) { return '<path d="M' + (x - 4) + ' ' + (y - 4) + ' l8 8 m0 -8 l-8 8" stroke="' + (col || '#fff') + '" stroke-width="2.4" stroke-linecap="round"/>'; };
    /* the deep field: one middle, two halves or three thirds */
    var n = S.deep.length;
    if (n === 1) o += '<path d="M44 30 Q86 -6 128 30Z" fill="rgba(73,163,255,.28)" stroke="#49a3ff" stroke-width="1.5"/>';
    else if (n) { var w = 168 / n; for (i = 0; i < n; i++) o += '<path d="M' + (2 + i * w) + ' 30 Q' + (2 + i * w + w / 2) + ' -6 ' + (2 + (i + 1) * w) + ' 30Z" fill="rgba(73,163,255,.28)" stroke="#49a3ff" stroke-width="1.5"/>'; }
    else o += '<text x="86" y="22" text-anchor="middle" font-family="Inter, sans-serif" font-weight="900" font-size="10" letter-spacing="1.5" fill="#ff8a7a">NOBODY DEEP</text>';
    S.zone.forEach(function (z) { o += '<ellipse cx="' + z[0] + '" cy="' + (z[1] + 2) + '" rx="13" ry="7" fill="rgba(25,198,167,.22)" stroke="#19c6a7" stroke-width="1.2"/>'; });
    /* man: a gold line from each defender to his receiver */
    S.man.forEach(function (m, k) { o += '<path d="M' + m[0] + ' ' + (m[1] + 4) + ' L' + RECV[k] + ' 64" stroke="#ffd75e" stroke-width="2" stroke-linecap="round"/>'; });
    /* the line of scrimmage and the receivers */
    o += '<line x1="0" y1="62" x2="172" y2="62" stroke="#4aa3ff" stroke-width="2"/>';
    RECV.forEach(function (x) { o += '<circle cx="' + x + '" cy="70" r="5" fill="none" stroke="#e9f2ea" stroke-width="2"/>'; });
    /* the defenders */
    S.deep.forEach(function (d) { o += X(d[0], d[1]); });
    S.zone.forEach(function (z) { o += X(z[0], z[1]); });
    S.man.forEach(function (m) { o += X(m[0], m[1]); });
    (S.lb || []).forEach(function (l) { o += X(l[0], l[1]); });
    /* the rush: big red arrows through the line */
    S.rush.forEach(function (x) { o += X(x, 40, '#ff6b5a') + '<path d="M' + x + ' 46 L' + x + ' 70" stroke="#ff6b5a" stroke-width="3" stroke-linecap="round"/><path d="M' + (x - 5) + ' 67 L' + x + ' 76 L' + (x + 5) + ' 67Z" fill="#ff6b5a"/>'; });
    return '<svg class="tart" viewBox="0 0 172 82" aria-hidden="true">' + o + '</svg>';
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
    A.watch3d(res, function () {}, { play: item.play, kind: 'drawn' });
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
