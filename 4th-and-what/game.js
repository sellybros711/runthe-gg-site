/* 4th and What: the breakdown (since 2026-10-31 Play is the video game in
 * flow.js; this view is where a snap is studied on turf).
 *
 * Pick a play (the Studio's, a concept, or one from a playbook), the down,
 * the distance and the spot (the owner's call, 2026-10-31: any down and
 * spot, 4th and 5 on the 40 stays the default), and the defense, or let it
 * pick. Run Play: the engine decides everything at once and this draws its
 * frames on turf, with the defense's coverage shaded if asked. The timeline
 * scrubs, the result says why, and Watch in 3D plays the same snap in the
 * stadium (play.js).
 *
 * The scoreboard keeps this visit's tally: a conversion scores for the
 * offense, a stop for the defense.
 *
 * ?seed=N on the url fixes the first snap's seed, to reproduce a result.
 *
 * Plain script: window.FAW_GAME (for the checks).
 */
(function () {
  'use strict';
  var A = window.FAW_APP, E = window.FAW_ENGINE, T = window.FAW_TURF, RNG = window.FAW_RNG, SH = window.FAW_SHARE, B = window.FAW_BOOK;
  var $ = function (id) { return document.getElementById(id); };
  var V = null, res = null, plans = null, played = null, t = 0, t0 = 0, playing = false, last = 0, raf = 0, tally = { off: 0, def: 0 };
  var forced = (location.search.match(/[?&]seed=(\d+)/) || [])[1];

  /* ---------- the settings ---------- */
  A.fill($('gDown'), [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th']], A.SC.down);
  var dists = []; for (var d = 1; d <= 25; d++) dists.push([d, String(d)]);
  A.fill($('gDist'), dists, A.SC.distance);
  var yards = []; for (var y = 1; y <= 50; y++) yards.push([y, String(y)]);
  A.fill($('gYard'), yards, 40);
  A.fill($('gDef'), [['random', 'Random (the defense picks)']].concat(E.CALL_KEYS.map(function (k) { return [k, A.CALL_LABEL[k]]; })), 'random');
  function readSituation() {
    var side = $('gSide').value, yd = +$('gYard').value;
    A.SC.down = +$('gDown').value;
    A.SC.ballOn = side === 'opp' ? yd : 100 - yd;
    A.SC.distance = Math.min(+$('gDist').value, A.SC.ballOn);
    sit();
  }
  function writeSituation() {
    $('gDown').value = String(A.SC.down); $('gDist').value = String(Math.min(25, A.SC.distance));
    $('gSide').value = A.SC.ballOn <= 50 ? 'opp' : 'own'; $('gYard').value = String(A.SC.ballOn <= 50 ? A.SC.ballOn : 100 - A.SC.ballOn);
    sit();
  }
  function sit() { var s = A.sitText(); $('gSit').textContent = s.down; $('gSpot').textContent = s.spot; }
  ['gDown', 'gDist', 'gSide', 'gYard'].forEach(function (id) { $(id).addEventListener('change', function () { readSituation(); res = null; drawSet(); }); });
  $('gPlay').addEventListener('change', function () { A.runChoice = this.value; var c = A.choice(this.value); if (c.distance && c.entry) { A.SC.distance = Math.min(c.distance, A.SC.ballOn); writeSituation(); } res = null; drawSet(); });
  $('gCov').addEventListener('change', function () { redraw(); });
  $('gIcons').addEventListener('change', function () { redraw(); });
  $('gDef').addEventListener('change', function () { res = null; drawSet(); });

  function current() { return A.choice(A.runChoice || 'draft'); }
  function fillPlays() { A.fill($('gPlay'), A.choiceOptions(A.choices()), A.runChoice || 'draft'); if (!$('gPlay').value) $('gPlay').selectedIndex = 0; A.runChoice = $('gPlay').value; }

  /* ---------- the field ---------- */
  function layout() {
    var Y0 = 100 - A.SC.ballOn;
    if (!V) V = T.view($('gField'), {});
    V.set({ BX: A.SC.ballX, Y0: Y0, marker: Math.min(100, Y0 + A.SC.distance), behind: 11, ahead: 29 , across: T.across() });
    V.layout();
  }
  function plansFor(play, key) { if (!E.plans || !key) return null; try { return E.plans(A.SC, play, key); } catch (e) { return null; } }
  /* before the snap: the play as drawn against the defense's look */
  function drawSet() {
    layout();
    var c = current(), key = $('gDef').value !== 'random' ? $('gDef').value : null;
    var pl = $('gCov').checked && key ? plansFor(c.play, key) : null;
    V.field().play(c.play, { defense: true, defenseStyle: 'x', plans: pl, coverage: !!pl, distance: A.SC.distance });
    $('gCap').textContent = '';
    $('gTime').value = 0; clock(0);
  }
  function redraw() {
    if (!res) { drawSet(); return; }
    V.field();
    V.frame(res, t, { play: played, coverage: $('gCov').checked, plans: plans, icons: $('gIcons').checked });
    caption(t); clock(t);
    $('gTime').value = String(Math.round((t - t0) / (res.frames[res.frames.length - 1].t - t0) * 1000));
  }
  function clock(tt) {
    var end = res ? res.frames[res.frames.length - 1].t : t0, f = function (s) { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
    $('gClock').textContent = f(tt - t0) + ' / ' + f(end - t0);
  }
  function caption(tt) {
    var txt = '';
    if (res) for (var i = 0; i < res.events.length; i++) { if (res.events[i].t <= tt) txt = res.events[i].text; }
    $('gCap').textContent = txt;
  }

  /* ---------- the snap ---------- */
  function run() {
    fillPlays();
    readSituation();
    var c = current(), play = c.play;
    if (!(play.handoff && play.handoff.to) && !(play.targets && play.targets.length)) {
      A.toast('gToast', 'Give the play a read (Studio, Read) or make it a run first.'); return;
    }
    var key = $('gDef').value !== 'random' ? $('gDef').value : null;
    var seed = forced != null ? (+forced >>> 0) : RNG.freshSeed(); forced = null;
    played = A.copy(play);
    res = E.run(A.SC, played, seed, key ? { call: key } : undefined);
    plans = res.plans || plansFor(played, res.callKey);
    t0 = res.pre && res.pre.length ? res.pre[0].t : 0;
    if (res.win) tally.off++; else tally.def++;
    $('gOff').textContent = tally.off; $('gDefScore').textContent = tally.def;
    /* a playbook play counts the snap against whatever the defense called */
    if (c.entry && c.book) { B.countSnap(c.entry, res.distance, res.callKey, res.win); A.store.put(c.book); }
    t = t0; playing = true; last = 0;
    layout(); result(); tick();
  }
  function tick(now) {
    cancelAnimationFrame(raf);
    if (!playing || !res) return;
    if (now && last) t += (now - last) / 1000 * (+$('gSpeed').value || 1);
    last = now || 0;
    var end = res.frames[res.frames.length - 1].t;
    if (t >= end) { t = end; playing = false; }
    redraw();
    if (playing) raf = requestAnimationFrame(tick);
  }
  $('gRun').addEventListener('click', run);
  $('gPlayBtn').addEventListener('click', function () {
    if (!res) { run(); return; }
    if (t >= res.frames[res.frames.length - 1].t) t = t0;
    playing = !playing; last = 0; if (playing) tick();
  });
  $('gTime').addEventListener('input', function () { if (!res) return; playing = false; t = t0 + +this.value / 1000 * (res.frames[res.frames.length - 1].t - t0); redraw(); });

  /* ---------- the result ---------- */
  function result() {
    var r = res, big = $('gResBig');
    var gained = r.outcome === 'incomplete' || r.outcome === 'throwaway' ? 0 : r.yards;
    big.className = 'resultbig ' + (r.win ? 'win' : 'lose');
    big.textContent = r.outcome === 'touchdown' ? 'Touchdown' : r.outcome === 'sack' ? 'Sack' : r.outcome === 'incomplete' ? 'Incomplete' : r.outcome === 'throwaway' ? 'Thrown away' : r.outcome === 'fumble' ? 'Fumble' : r.outcome === 'safety' ? 'Safety' : (gained >= 0 ? gained + ' yard gain' : (-gained) + ' yard loss');
    var target = r.throwInfo && r.throwInfo.to ? (T.LABEL[r.throwInfo.to] || r.throwInfo.to) + (r.throwInfo.primary ? ' (1st read)' : '') : r.isRun ? 'Run' : '-';
    var verdict = r.title.charAt(0) + r.title.slice(1).toLowerCase();
    var rows = [['Result', verdict], ['Target', target],
      ['Completion', r.isRun ? '-' : r.outcome === 'incomplete' || r.outcome === 'throwaway' || r.outcome === 'sack' ? 'No' : r.throwInfo ? 'Yes' : '-'],
      ['Yards', String(gained)], ['First down', r.win ? 'Yes' : 'No'], ['Defense', r.callName]];
    var dl = $('gStats'); dl.innerHTML = '';
    rows.forEach(function (x) { dl.appendChild(A.el('dt', { text: x[0] })); dl.appendChild(A.el('dd', { text: x[1], class: x[0] === 'First down' && r.win ? 'win' : null })); });
    $('gWhy').textContent = r.reason + ' ' + r.callLine;
    $('gBreakBtn').disabled = false; $('g3d').disabled = false; $('gShare').disabled = false;
    $('gBreak').hidden = true;
    $('dbgTxt').textContent = 'seed ' + r.seed + '\nformation ' + r.formation + ' · box ' + r.box + '\npocket ' + r.pocket + ' s' +
      (r.throwInfo ? '\nthrow ' + r.throwInfo.dist + ' yd to ' + r.throwInfo.to + (r.throwInfo.sep != null ? ' · open by ' + r.throwInfo.sep + ' · catch chance ' + Math.round(r.throwInfo.p * 100) + '%' : '') : '') +
      '\nreplay this exact snap: ?seed=' + r.seed;
  }
  $('gBreakBtn').addEventListener('click', function () {
    var box = $('gBreak'); box.hidden = !box.hidden; if (box.hidden || !res) return;
    box.innerHTML = '';
    box.appendChild(A.el('p', { text: res.callName + '. ' + res.callLine }));
    if (plans) {
      var T2 = A.el('table'), LET = T.letters(window.FAW_FORMATIONS.place(played.formation, played.moved), plans);
      plans.forEach(function (p) {
        var job = p.plan === 'rush' ? (p.blitz ? 'Blitzes' : 'Rushes') : p.plan === 'man' ? 'Man on the ' + (T.LABEL[p.man] || p.man) : (p.deep ? 'Deep zone' : 'Short zone');
        T2.appendChild(A.el('tr', {}, [A.el('td', { text: LET[p.id] || p.id }), A.el('td', { text: job })]));
      });
      box.appendChild(T2);
    }
  });
  $('g3d').addEventListener('click', function () { if (res) A.watch3d(res); });
  $('gShare').addEventListener('click', function () {
    if (!res) return;
    SH.send(SH.text(res)).then(function (how) { A.toast('gToast', how === 'copied' ? 'Copied. Paste it anywhere.' : how === 'shared' ? 'Shared.' : how === 'cancelled' ? '' : 'Could not share from here.'); });
  });
  $('gEdit').addEventListener('click', function () {
    var c = current();
    if (c.entry && c.book && window.FAW_STUDIO) { window.FAW_STUDIO.open(c.book.id, c.entry.id); return; }
    if (c.key !== 'draft') { var d = A.draft; d.play = A.copy(c.play); d.ref = null; d.nameEdited = false; A.setDraft(d); }
    A.show('studio');
  });

  /* a snap already played (Play's 3D run): shown here on turf, from the start */
  function load(r, play) {
    fillPlays(); writeSituation();
    res = r; played = A.copy(play);
    plans = res.plans || plansFor(played, res.callKey);
    t0 = res.pre && res.pre.length ? res.pre[0].t : 0;
    t = t0; playing = true; last = 0;
    layout(); result(); tick();
  }

  A.on('replay', function () { fillPlays(); writeSituation(); if (res) { layout(); redraw(); } else drawSet(); });
  A.on('remote', function () { if (A.current() === 'replay') fillPlays(); });
  window.addEventListener('resize', function () { if (A.current() === 'replay') { layout(); redraw(); } });

  window.FAW_GAME = { run: run, load: load, last: function () { return res; }, seek: function (s) { playing = false; t = s; redraw(); } };
})();
