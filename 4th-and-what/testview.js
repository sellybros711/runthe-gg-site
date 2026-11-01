/* 4th and What: Test vs Defense.
 *
 * Every defense, forced, many snaps each (the owner's call, 2026-10-30: the
 * rate against every kind of defense). run(..., { call }) still rolls the
 * call first, so the dice after it fall the same way: the only thing that
 * changes between the rows is the defense. A playbook play keeps its result
 * at its distance, with a key of the drawing, so a changed play says so.
 *
 * Plain script: window.FAW_TESTVIEW (for the checks).
 */
(function () {
  'use strict';
  var A = window.FAW_APP, E = window.FAW_ENGINE, T = window.FAW_TURF, B = window.FAW_BOOK;
  var $ = function (id) { return document.getElementById(id); }, el = A.el;
  var V = null, busy = false;

  function playKey(p) { return JSON.stringify([p.formation, p.moved, p.routes, p.blocks, p.handoff, p.targets, p.motion || null, !!p.playAction]); }
  A.fill($('tDown'), [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th']], 4);
  var dists = []; for (var d = 1; d <= 25; d++) dists.push([d, String(d)]);
  A.fill($('tDist'), dists, 5);

  function fillPlays() { A.fill($('tPlay'), A.choiceOptions(A.choices()), A.testChoice || 'draft'); if (!$('tPlay').value) $('tPlay').selectedIndex = 0; A.testChoice = $('tPlay').value; }
  function cur() { return A.choice(A.testChoice || 'draft'); }
  /* a playbook's play is tested at the playbook's level */
  $('tPlay').addEventListener('change', function () { A.testChoice = this.value; var c = cur(); if (c.distance) $('tDist').value = String(c.distance); if (c.book) A.setLevel(c.book.level || 'nfl'); drawPlay(); renderSaved(); });
  $('tDist').addEventListener('change', renderSaved);

  function drawPlay() {
    if (!V) V = T.view($('tField'), {});
    var dist = +$('tDist').value;
    V.set({ BX: A.SC.ballX, Y0: 60, marker: 60 + dist, behind: 10, ahead: 24 , across: T.across() }); V.layout();
    V.field().play(cur().play, { distance: dist });
  }
  function scen() {
    var sc = A.copy(A.SC); sc.down = +$('tDown').value; sc.distance = +$('tDist').value;
    if (sc.distance > sc.ballOn) sc.ballOn = Math.max(sc.distance, 40);
    return sc;
  }

  $('tRun').addEventListener('click', function () {
    if (busy) return;
    var c = cur(), play = c.play;
    if (!(play.handoff && play.handoff.to) && !(play.targets && play.targets.length)) { $('tOut').textContent = 'Give it a read or make it a run first (Studio).'; return; }
    var sc = scen(), n = +$('tN').value, keys = E.CALL_KEYS.slice(), res = {}, k = 0, s = 1;
    busy = true; $('tRun').disabled = true;
    (function step() {
      var t0 = Date.now();
      while (k < keys.length && Date.now() - t0 < 40) {
        var key = keys[k], r = E.run(sc, play, s * 7919, { call: key });
        var o = res[key] = res[key] || { n: 0, w: 0, yds: 0, td: 0, sack: 0 }; o.n++; if (r.win) o.w++; o.yds += r.yards; if (r.outcome === 'touchdown') o.td++; if (r.outcome === 'sack') o.sack++;
        if (++s > n) { s = 1; k++; }
      }
      if (k < keys.length) { $('tOut').textContent = 'Testing against every defense. ' + Math.round(k * 100 / keys.length) + '%'; setTimeout(step, 0); return; }
      res.at = new Date().toISOString(); res.key = playKey(play); res.distance = sc.distance;
      if (c.entry && c.book) {
        var S = B.statsOf(c.entry, sc.level), st = S[sc.distance] = S[sc.distance] || {};
        st.test = res; A.store.put(c.book);
      }
      busy = false; $('tRun').disabled = false;
      show(res, play, c);
    })();
  });

  function show(res, play, c) {
    var out = $('tOut'); out.innerHTML = '';
    var rows = E.CALL_KEYS.map(function (k) { var a = res[k]; return { k: k, n: a ? a.n : 0, w: a ? a.w : 0, yds: a && a.n ? a.yds / a.n : 0, sack: a ? a.sack : 0 }; });
    var best = rows.slice().sort(function (a, b) { return b.w / (b.n || 1) - a.w / (a.n || 1); })[0], worst = rows.slice().sort(function (a, b) { return a.w / (a.n || 1) - b.w / (b.n || 1); })[0];
    var tn = 0, tw = 0; rows.forEach(function (r) { tn += r.n; tw += r.w; });
    var stale = res.key && res.key !== playKey(play);
    out.appendChild(el('div', { class: 'verdict' }, [
      el('b', { text: A.ordinal(+$('tDown').value) + ' and ' + (res.distance || $('tDist').value) + ': ' + A.pct(tw, tn) + ' against every defense.' }),
      el('div', { text: 'Best against ' + A.CALL_LABEL[best.k] + ' (' + A.pct(best.w, best.n) + '). Worst against ' + A.CALL_LABEL[worst.k] + ' (' + A.pct(worst.w, worst.n) + ').' }),
      stale ? el('div', { class: 'help', text: 'The play has changed since this test. Test it again.' }) : null
    ]));
    var LS = c && c.entry ? B.statsOf(c.entry, A.SC.level) : null, live = LS && LS[res.distance] ? LS[res.distance].byCall || {} : {};
    var tbl = el('table', { class: 'testt' }, [el('tr', {}, ['Defense', 'Converted', '', 'Avg yards', 'Sacks', 'Your snaps'].map(function (h) { return el('th', { text: h }); }))]);
    rows.forEach(function (r) {
      var l = live[r.k];
      tbl.appendChild(el('tr', { class: r === best ? 'best' : '' }, [el('td', { text: A.CALL_LABEL[r.k] }), el('td', { text: A.pct(r.w, r.n) }),
        el('td', { class: 'bar' }, [el('div', { class: 'b', style: 'width:' + Math.round(r.n ? r.w * 100 / r.n : 0) + '%' })]),
        el('td', { text: r.n ? r.yds.toFixed(1) : '-' }), el('td', { text: String(r.sack) }), el('td', { text: l ? l.w + ' of ' + l.n : '-' })]));
    });
    tbl.appendChild(el('tr', { class: 'tot' }, [el('td', { text: 'Every defense' }), el('td', { text: A.pct(tw, tn) }), el('td'), el('td'), el('td'), el('td')]));
    out.appendChild(tbl);
    if (!(c && c.entry)) out.appendChild(el('p', { class: 'help', text: 'Save the play to a playbook to keep this test with it.' }));
  }
  function renderSaved() {
    var c = cur(), d = +$('tDist').value;
    var st = c.entry && B.statsOf(c.entry, A.SC.level)[d];
    if (st && st.test) show(Object.assign({ distance: d }, st.test), c.play, c); else $('tOut').innerHTML = '';
    drawPlay();
  }

  A.on('test', function () { fillPlays(); var c = cur(); if (c.distance) $('tDist').value = String(c.distance); renderSaved(); });
  A.on('remote', function () { if (A.current() === 'test') fillPlays(); });
  window.addEventListener('resize', function () { if (A.current() === 'test') drawPlay(); });
  window.FAW_TESTVIEW = { playKey: playKey };
})();
