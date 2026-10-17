/* 4th and What: the screens.
 *
 * Pick the distance, draw the play, snap it, see the result. One SCENARIO
 * (config.js) holds the distance, the spot and the roster; the picker only
 * changes its distance.
 *
 * Nothing here opens a guide by itself (the owner's rule for every game):
 * How it works is behind the ? button.
 *
 * ACCOUNTS ARE NOT WIRED IN v1. The shell gives sign in for free
 * (/arcade/auth.js and auth-ui.js put the button in the top bar). Where the
 * rest would plug in is marked TODO(account) below.
 *
 * ?seed=N on the url fixes the first snap's seed, to reproduce a result.
 *
 * Plain script, no exports.
 */
(function () {
  'use strict';
  var C = window.FAW_CONFIG, E = window.FAW_ENGINE, F = window.FAW_FORMATIONS, RNG = window.FAW_RNG, SH = window.FAW_SHARE, LIVE = window.FAW_LIVE;
  var $ = function (id) { return document.getElementById(id); };
  var SC = JSON.parse(JSON.stringify(C.SCENARIO));
  var Y0 = 100 - SC.ballOn;
  var board = null, live = null, last = null, lastPlay = null, lastSeed = null;
  var forced = (location.search.match(/[?&]seed=(\d+)/) || [])[1];

  function show(id) { ['sPick', 'sBoard', 'sLive'].forEach(function (s) { $(s).hidden = s !== id; }); }
  function downName() { return E.downName(SC.distance, Y0); }

  /* ---------- 1. the distance ---------- */
  $('pickLede').textContent = 'Ball on ' + E.spotName(Y0) + '. Pick the distance.';
  C.DISTANCES.forEach(function (d) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'dist'; b.dataset.d = d;
    b.innerHTML = '<small>4th and</small><b>' + (Y0 + d >= 100 ? 'goal' : d) + '</b>';
    b.addEventListener('click', function () { pick(d); });
    $('dists').appendChild(b);
  });
  function pick(d) {
    SC.distance = d;
    show('sBoard');
    if (!board) makeBoard();
    board.layout();
    refresh();
    LIVE.prepare(SC.ballX, Y0);
  }
  $('bDist').addEventListener('click', function () { show('sPick'); });

  /* ---------- 2. the clipboard ---------- */
  function makeBoard() {
    board = window.FAW_BOARD.create($('cBoard'), {
      formation: 'gun3x1',
      scenario: function () { return SC; },
      onChange: refresh,
      onHint: function (t) { $('hint').textContent = t || ''; }
    });
    F.SETS.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'form'; b.dataset.f = s.id; b.setAttribute('role', 'radio'); b.textContent = s.name;
      b.addEventListener('click', function () { board.setFormation(s.id); });
      $('forms').appendChild(b);
    });
    board.setTool('route');
  }
  function refresh() {
    if (!board) return;
    var p = board.play();
    $('downTxt').textContent = downName();
    $('spotTxt').textContent = 'Ball on ' + E.spotName(Y0);
    $('boxTxt').textContent = 'Box ' + board.box();
    Array.prototype.forEach.call(document.querySelectorAll('.form'), function (b) { b.setAttribute('aria-checked', String(b.dataset.f === p.formation)); });
    var run = board.isRun();
    var tb = document.querySelector('.tool[data-tool="target"]');
    tb.disabled = run;
    if (run && board.tool() === 'target') setTool('route');
    $('bSnap').disabled = !board.ready();
  }
  function setTool(t) {
    board.setTool(t);
    Array.prototype.forEach.call(document.querySelectorAll('.tool'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tool'), function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
  $('bUndo').addEventListener('click', function () { board && board.undo(); });
  $('bClear').addEventListener('click', function () { board && board.clear(); });
  $('bSnap').addEventListener('click', function () { if (board && board.ready()) snap(board.play(), null); });

  /* ---------- 3. the snap ---------- */
  function snap(play, seed) {
    if (seed == null) seed = forced != null ? (+forced >>> 0) : RNG.freshSeed();
    forced = null;
    lastPlay = play; lastSeed = seed;
    var res = E.run(SC, play, seed);
    last = res;
    show('sLive');
    $('result').hidden = true; $('toast').hidden = true; $('bSkip').hidden = false; $('cap').textContent = '';
    if (live) live.stop();
    live = LIVE.show($('cLive'), res, {
      caption: function (t) { $('cap').textContent = t; },
      pressure: function (p) { $('pressFill').style.width = Math.round(p * 100) + '%'; $('press').style.opacity = res.isRun ? '0' : '1'; },
      done: result
    });
  }
  $('bSkip').addEventListener('click', function () { live && live.skip(); });

  /* ---------- 4. the result ---------- */
  function result(r) {
    $('bSkip').hidden = true;
    var box = $('result');
    box.className = 'result ' + (r.win ? 'win' : 'lose');
    $('rDown').textContent = r.down;
    $('rTitle').textContent = r.title;
    var gained = r.outcome === 'incomplete' || r.outcome === 'throwaway' ? 'No gain' : (r.yards >= 0 ? 'Gained ' + r.yards : 'Lost ' + (-r.yards));
    $('rLine').textContent = gained + (r.spot && r.outcome !== 'touchdown' && r.outcome !== 'incomplete' && r.outcome !== 'throwaway' ? ' · Ball at ' + r.spot : '');
    $('rWhy').textContent = r.reason;
    $('rCall').textContent = 'The defense: ' + r.callName + '. ' + r.callLine;
    $('dbgTxt').textContent = 'seed ' + r.seed + '\nformation ' + r.formation + ' · box ' + r.box + '\npocket ' + r.pocket + ' s' +
      (r.throwInfo ? '\nthrow ' + r.throwInfo.dist + ' yd to ' + r.throwInfo.to + (r.throwInfo.primary ? ' (first read)' : ' (checkdown)') + (r.throwInfo.sep != null ? ' · open by ' + r.throwInfo.sep + ' · catch chance ' + Math.round(r.throwInfo.p * 100) + '%' : '') : '') +
      '\nreplay this exact snap: ?seed=' + r.seed;
    box.hidden = false;
    /* TODO(account): a signed in player's result goes to the shared board and
       streak here, as the arcade games do (window.RTG_BOARD.submit). */
    /* TODO(trophies): first conversion, a 4th and 15 conversion, a touchdown from the 40. */
  }
  $('bReplay').addEventListener('click', function () { if (lastPlay) snap(lastPlay, null); });
  $('bBack').addEventListener('click', function () { if (live) live.stop(); show('sBoard'); board.layout(); refresh(); });
  $('bShare').addEventListener('click', function () {
    if (!last) return;
    SH.send(SH.text(last)).then(function (how) {
      var t = $('toast'); t.hidden = false;
      t.textContent = how === 'copied' ? 'Copied. Paste it anywhere.' : how === 'shared' ? 'Shared.' : how === 'cancelled' ? '' : 'Could not share from here.';
      if (!t.textContent) t.hidden = true;
    });
  });

  /* ---------- the shell ---------- */
  $('bGuide').addEventListener('click', function () { var g = $('guide'); if (g.showModal) g.showModal(); else g.setAttribute('open', ''); });
  $('themeBtn').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('runthegrid_theme', next); } catch (e) {}
    var m = $('themeMeta'); if (m) m.setAttribute('content', next === 'dark' ? '#10161f' : '#ece7dc');
  });
  window.addEventListener('faw-pxhd', function () { if (window.FAW_RIG) window.FAW_RIG.init(window.FAW_PXHD); });
  if (window.FAW_PXHD && window.FAW_RIG) window.FAW_RIG.init(window.FAW_PXHD);

  /* for the checks */
  window.FAW_UI = { pick: pick, snap: snap, setTool: setTool, board: function () { return board; }, last: function () { return last; }, scenario: SC };
})();
