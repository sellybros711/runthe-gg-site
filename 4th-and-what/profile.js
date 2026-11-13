/* 4th and What: your coach record, and the football moments.
 *
 * The launch plan, Phase 2 (approved 2026-11-13): a record and football
 * moments to collect, no currencies and no pay to win. Kept on this device.
 *
 * The record: snaps and conversions (every scored snap: Go For It, practice
 * and the daily), the longest 4th down converted, the best Go For It run, and
 * your signature play (the concept you have converted with most).
 *
 * The moments are things that happen in real football, each earned once,
 * each read straight off the engine's result (nothing is typed by hand):
 *   long        convert a 4th and 10 or more
 *   blitz       convert against Cover 0, everybody coming
 *   rotation    convert when they showed one look and played another
 *   inches      convert by less than a yard
 *   six         score a touchdown
 *   house       score from your own half
 *   streak5     five converted in one Go For It run
 *   streak10    ten converted in one Go For It run
 *
 * Plain script: window.FAW_PROFILE in the page, module.exports in node.
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  var MOMENTS = [
    { id: 'long', name: '4th and long', how: 'Convert a 4th and 10 or more.' },
    { id: 'blitz', name: 'Beat the blitz', how: 'Convert against Cover 0, everybody coming.' },
    { id: 'rotation', name: 'Saw the rotation', how: 'Convert when they disguised the look.' },
    { id: 'inches', name: 'By inches', how: 'Convert by less than a yard.' },
    { id: 'six', name: 'Six', how: 'Score a touchdown.' },
    { id: 'house', name: 'Took it to the house', how: 'Score from your own half.' },
    { id: 'streak5', name: 'Five straight', how: 'Convert five in one Go For It run.' },
    { id: 'streak10', name: 'Ten in a run', how: 'Convert ten in one Go For It run.' }
  ];

  function blank() { return { snaps: 0, conv: 0, longest: 0, bestRun: 0, plays: {}, moments: {} }; }
  /* record(p, res, meta): the record after a snap, and the moments it earned.
     meta: { name: the play's name, run: Go For It's converted count after it } */
  function record(p0, res, meta) {
    var p = JSON.parse(JSON.stringify(p0 || blank())), got = [];
    meta = meta || {};
    p.snaps++;
    var td = res.outcome === 'touchdown';
    function earn(id) { if (!p.moments[id]) { p.moments[id] = new Date().toISOString().slice(0, 10); got.push(id); } }
    if (res.win) {
      p.conv++;
      if (res.distance > p.longest) p.longest = res.distance;
      if (meta.name) p.plays[meta.name] = (p.plays[meta.name] || 0) + 1;
      if (res.distance >= 10) earn('long');
      if (res.callKey === 'cover0') earn('blitz');
      if (res.disguised) earn('rotation');
      if (!td && res.spotY != null && res.marker < 100 && res.spotY - res.marker < 1) earn('inches');
      if (td) { earn('six'); if (res.ballOn > 50) earn('house'); }
    }
    if (meta.run != null) {
      if (meta.run > p.bestRun) p.bestRun = meta.run;
      if (meta.run >= 5) earn('streak5');
      if (meta.run >= 10) earn('streak10');
    }
    return { profile: p, earned: got };
  }
  function signature(p) {
    var best = null, n = 0;
    Object.keys(p.plays || {}).forEach(function (k) { if (p.plays[k] > n) { n = p.plays[k]; best = k; } });
    return best ? { name: best, n: n } : null;
  }
  function momentOf(id) { for (var i = 0; i < MOMENTS.length; i++) if (MOMENTS[i].id === id) return MOMENTS[i]; return null; }

  var CORE = { MOMENTS: MOMENTS, blank: blank, record: record, signature: signature, momentOf: momentOf };
  if (isNode) { module.exports = CORE; return; }

  /* ================= the page ================= */
  var A = root.FAW_APP, KEY = 'faw_profile';
  var $ = function (id) { return document.getElementById(id); }, el = A.el;
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || blank(); } catch (e) { return blank(); } }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
  var prof = load(), last = [];

  /* flow.js tells it every scored snap */
  function snapped(res, meta) {
    var r = record(prof, res, meta); prof = r.profile; last = r.earned; save(prof);
    render();
  }
  /* the card's line for a moment just earned */
  function card() {
    var box = $('rMoment'); if (!box) return;
    box.hidden = !last.length;
    if (last.length) box.textContent = 'New moment: ' + last.map(function (id) { return momentOf(id).name; }).join(', ') + '.';
  }
  function render() {
    var box = $('pRecord'); if (!box) return;
    box.hidden = !prof.snaps;
    if (!prof.snaps) return;
    var sig = signature(prof), pct = Math.round(prof.conv * 100 / prof.snaps), n = Object.keys(prof.moments).length;
    $('prLine').textContent = prof.conv + ' of ' + prof.snaps + ' converted (' + pct + '%)' + (prof.longest ? ' · longest: 4th & ' + prof.longest : '') + (prof.bestRun ? ' · best run: ' + prof.bestRun : '');
    $('prSig').textContent = sig ? 'Signature play: ' + sig.name : '';
    $('prSig').hidden = !sig;
    $('prCount').textContent = n + ' of ' + MOMENTS.length + ' moments';
    var list = $('prMoments'); list.textContent = '';
    MOMENTS.forEach(function (m) {
      var has = !!prof.moments[m.id];
      list.appendChild(el('span', { class: 'moment' + (has ? ' got' : ''), title: m.how, text: m.name }));
    });
  }
  A.on('play', render);
  render();

  root.FAW_PROFILE = { snapped: snapped, card: card, get: function () { return prof; }, core: CORE };
})(typeof window !== 'undefined' ? window : this);
