/* 4th and What: the screens of the game.
 *
 * Home, then one of two things:
 *   Build a Play   pick the distance, draw the play, snap it, see the result.
 *                  Download the drawing, or save it to a playbook.
 *   My Playbooks   book-ui.js. A playbook play opens on this same clipboard in
 *                  'edit' mode: its name, section and notes above it, and Save,
 *                  Test it and the defense to snap against below it.
 * One SCENARIO (config.js) holds the distance, the spot and the roster; the
 * picker only changes its distance.
 *
 * Nothing here opens a guide by itself (the owner's rule for every game):
 * How it works is behind the ? button.
 *
 * Sign in comes from the shell (/arcade/auth.js and auth-ui.js put the button
 * in the top bar). Playbooks need it; the game does not. Results on the
 * shared board and trophies are still TODO(account) below.
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
  var board = null, live = null, last = null, lastPlay = null, lastSeed = null, lastCall = null;
  var forced = (location.search.match(/[?&]seed=(\d+)/) || [])[1];
  /* 'build' (Build a Play) or 'edit' (a playbook play, driven by book-ui.js) */
  var mode = 'build', hooks = {};
  var SCREENS = ['sHome', 'sPick', 'sBoard', 'sLive', 'sBooks', 'sBook', 'sTerms', 'sExport'];

  function show(id) {
    SCREENS.forEach(function (s) { if ($(s)) $(s).hidden = s !== id; });
    if (id === 'sBoard' && board) { board.layout(); refresh(); }
    if (id === 'sHome' && homeClip) homeClip.start();
    window.scrollTo(0, 0);
    if (hooks.shown) hooks.shown(id);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) { b.addEventListener('click', function () { show(b.dataset.go); }); });
  $('goBuild').addEventListener('click', function () { setMode('build'); show('sPick'); });
  $('goBooks').addEventListener('click', function () { show('sBooks'); });
  var homeClip = window.FAW_HOME ? window.FAW_HOME.create($('cHome'), $('homeName'), function () { return !$('sHome').hidden; }) : null;
  if (homeClip) homeClip.start();
  function setMode(m) {
    mode = m;
    $('editBar').hidden = m !== 'edit'; $('editActs').hidden = m !== 'edit'; $('buildActs').hidden = m === 'edit';
    $('testPanel').hidden = true; $('boardToast').hidden = true;
  }
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
    if (!board) makeBoard();
    show('sBoard');
    LIVE.prepare(SC.ballX, Y0);
    if (hooks.distance) hooks.distance(d);
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
    formChips([]);
    board.setTool('route');
  }
  /* The five sets, then a playbook's own saved formations. */
  function formChips(custom) {
    var box = $('forms'); box.innerHTML = '';
    F.SETS.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'form'; b.dataset.f = s.id; b.setAttribute('role', 'radio'); b.textContent = s.name;
      b.addEventListener('click', function () { board.setFormation(s.id); });
      box.appendChild(b);
    });
    (custom || []).forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'form mine'; b.dataset.custom = f.id; b.setAttribute('role', 'radio'); b.textContent = f.name;
      b.addEventListener('click', function () { var p = window.FAW_BOARD.emptyPlay(f.base); p.moved = JSON.parse(JSON.stringify(f.moved || {})); p.customFormation = f.id; board.setPlay(p); });
      box.appendChild(b);
    });
  }
  function refresh() {
    if (!board) return;
    var p = board.play();
    $('downTxt').textContent = downName();
    $('spotTxt').textContent = 'Ball on ' + E.spotName(Y0);
    $('boxTxt').textContent = 'Box ' + board.box();
    Array.prototype.forEach.call(document.querySelectorAll('.form'), function (b) {
      b.setAttribute('aria-checked', String(b.dataset.custom ? b.dataset.custom === p.customFormation : (!p.customFormation && b.dataset.f === p.formation)));
    });
    var run = board.isRun();
    var tb = document.querySelector('.tool[data-tool="target"]');
    tb.disabled = run;
    if (run && board.tool() === 'target') setTool('route');
    $('bSnap').disabled = !board.ready();
    if (hooks.changed) hooks.changed(p);
  }
  function setTool(t) {
    board.setTool(t);
    Array.prototype.forEach.call(document.querySelectorAll('.tool'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tool'), function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
  $('bUndo').addEventListener('click', function () { board && board.undo(); });
  $('bClear').addEventListener('click', function () { board && board.clear(); });
  $('bSnap').addEventListener('click', function () {
    if (!board || !board.ready()) return;
    var call = mode === 'edit' && $('defSel').value !== 'random' ? $('defSel').value : null;
    snap(board.play(), null, call);
  });
  /* Download what is on the clipboard, as a clean diagram. */
  function downloadPlay(play, name) {
    var c = window.FAW_DIAGRAM.png(play, 1200, 1200, { color: true, field: true, distance: SC.distance, gain: true, numbers: true });
    window.FAW_EXPORT.download(c, window.FAW_EXPORT.slug(name || 'play') + '.png');
  }
  function suggestedName(play) { return window.FAW_NAMES.suggest(play, hooks.terms ? hooks.terms() : null).name; }
  $('bDownload').addEventListener('click', function () { if (board) { var p = board.play(); downloadPlay(p, suggestedName(p)); } });
  $('bSaveTo').addEventListener('click', function () { if (board && hooks.saveTo) hooks.saveTo(board.play(), SC.distance); });
  $('bResDownload').addEventListener('click', function () { if (lastPlay) downloadPlay(lastPlay, mode === 'edit' && hooks.name ? hooks.name() : suggestedName(lastPlay)); });
  $('bResSave').addEventListener('click', function () { if (lastPlay && hooks.saveTo) hooks.saveTo(lastPlay, SC.distance); });

  /* ---------- 3. the snap ---------- */
  function snap(play, seed, call) {
    if (seed == null) seed = forced != null ? (+forced >>> 0) : RNG.freshSeed();
    forced = null;
    lastPlay = play; lastSeed = seed; lastCall = call || null;
    var res = E.run(SC, play, seed, call ? { call: call } : undefined);
    last = res;
    show('sLive');
    $('result').hidden = true; $('toast').hidden = true; $('bSkip').hidden = false; $('cap').textContent = '';
    $('bResSave').hidden = mode === 'edit';
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
    /* a playbook play counts the snap against whatever the defense called */
    if (mode === 'edit' && hooks.snapped) hooks.snapped(r);
    /* TODO(account): a signed in player's result goes to the shared board and
       streak here, as the arcade games do (window.RTG_BOARD.submit). */
    /* TODO(trophies): first conversion, a 4th and 15 conversion, a touchdown from the 40. */
  }
  $('bReplay').addEventListener('click', function () { if (lastPlay) snap(lastPlay, null, lastCall); });
  $('bBack').addEventListener('click', function () { if (live) live.stop(); show('sBoard'); });
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

  /* book-ui.js drives the clipboard through this, and the checks use it too */
  window.FAW_UI = {
    pick: pick, snap: snap, setTool: setTool, show: show, setMode: setMode, formChips: formChips, downloadPlay: downloadPlay,
    board: function () { if (!board) makeBoard(); return board; }, last: function () { return last; }, scenario: SC,
    mode: function () { return mode; }, hook: function (k, fn) { hooks[k] = fn; },
    open: function (play, distance) { SC.distance = distance || SC.distance; if (!board) makeBoard(); setTool('route'); board.setPlay(play); show('sBoard'); LIVE.prepare(SC.ballX, Y0); }
  };
})();
