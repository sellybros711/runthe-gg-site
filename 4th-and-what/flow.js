/* 4th and What: Play, the video game.
 *
 * The owner, 2026-10-31: "I want the initial feature of the site to be a
 * video game. It's also just going to be a video game that you can use as a
 * real tool." So Play is the game loop the site started with:
 *   1. 4th and what?   big distance buttons (the down and the spot are a tap away)
 *   2. Draw it         the Studio in game mode: the field, the tools, Snap it
 *   3. Watch it        the snap in the 3D pixel stadium (play.js)
 *   4. The card        over the last frame: the result, why, the defense; Run it
 *                      back, Edit play, New play, Save play (to a playbook),
 *                      Save card (the picture, like Run The Tour's), Share, and
 *                      See the breakdown (the snap on turf, game.js)
 *
 * The play is the Studio's draft (FAW_APP.draft), so Build and Play share it.
 *
 * Plain script: window.FAW_FLOW (for the checks).
 */
(function () {
  'use strict';
  var A = window.FAW_APP, E = window.FAW_ENGINE, T = window.FAW_TURF, B = window.FAW_BOOK, SH = window.FAW_SHARE, RNG = window.FAW_RNG, C = window.FAW_CONFIG;
  var $ = function (id) { return document.getElementById(id); }, el = A.el;
  var res = null, played = null, card = null;
  var forced = (location.search.match(/[?&]seed=(\d+)/) || [])[1];

  /* ---------- 1. 4th and what? ---------- */
  A.fill($('pDown'), [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th']], A.SC.down);
  var yards = []; for (var y = 1; y <= 50; y++) yards.push([y, String(y)]);
  A.fill($('pYard'), yards, 40);
  function spotLine() {
    var s = A.sitText();
    $('pSpot').textContent = A.ordinal(A.SC.down) + ' down · Ball on ' + (A.SC.ballOn <= 50 ? 'the opponent\'s ' + A.SC.ballOn : 'your ' + (100 - A.SC.ballOn));
    $('sSit').textContent = s.down + ' · ' + s.spot;
    $('pDown').value = String(A.SC.down); $('pSide').value = A.SC.ballOn <= 50 ? 'opp' : 'own'; $('pYard').value = String(A.SC.ballOn <= 50 ? A.SC.ballOn : 100 - A.SC.ballOn);
    renderDists();
  }
  function renderDists() {
    var box = $('pDists'); box.innerHTML = '';
    C.DISTANCES.forEach(function (d) {
      var goal = d >= A.SC.ballOn;
      box.appendChild(el('button', { type: 'button', class: 'dist', 'data-d': String(d), on: { click: function () { pick(Math.min(d, A.SC.ballOn)); } } },
        [el('small', { text: A.ordinal(A.SC.down) + ' and' }), el('b', { text: goal ? 'Goal' : String(d) })]));
    });
  }
  function pick(d) { A.SC.distance = d; spotLine(); A.show('studio', { mode: 'game' }); }
  $('pMore').addEventListener('click', function () { $('pMoreBox').hidden = !$('pMoreBox').hidden; });
  ['pDown', 'pSide', 'pYard'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      A.SC.down = +$('pDown').value;
      var yd = +$('pYard').value; A.SC.ballOn = $('pSide').value === 'opp' ? yd : 100 - yd;
      A.SC.distance = Math.min(A.SC.distance, A.SC.ballOn);
      spotLine();
    });
  });
  $('sSit').addEventListener('click', function () { A.show('play'); });

  /* ---------- 2 and 3. Snap it, watch it ---------- */
  function ready(p) { return (p.handoff && p.handoff.to) || (p.targets && p.targets.length); }
  function snap() {
    var p = A.copy(A.draft.play);
    if (!ready(p)) { A.toast('sToast', 'Give it a read (Read, then tap a receiver) or make it a run first.'); $('sHint').textContent = 'Give it a read, or make it a run.'; return false; }
    var seed = forced != null ? (+forced >>> 0) : RNG.freshSeed(); forced = null;
    played = p;
    res = E.run(A.SC, p, seed);
    /* a playbook play counts the snap against whatever the defense called */
    var r = A.draft.ref, b = r && A.signedIn() ? A.store.book(r.book) : null;
    if (b) b.plays.forEach(function (e) { if (e.id === r.id) { B.countSnap(e, res.distance, res.callKey, res.win); A.store.put(b); } });
    A.watch3d(res, showCard);
    return true;
  }
  $('sSnap').addEventListener('click', snap);

  /* ---------- 4. the card ---------- */
  function title(r) { return r.title.charAt(0) + r.title.slice(1).toLowerCase(); }
  function showCard() {
    var r = res, c = $('rCard');
    c.className = 'rescard ' + (r.win ? 'win' : 'lose');
    $('rDown').textContent = A.sitText().down + ' · ' + A.sitText().spot;
    $('rTitle').textContent = title(r);
    var gained = r.outcome === 'incomplete' || r.outcome === 'throwaway' ? 'No gain' : (r.yards >= 0 ? 'Gained ' + r.yards : 'Lost ' + (-r.yards));
    $('rLine').textContent = gained + ' · ' + r.callName;
    $('rWhy').textContent = r.reason;
    $('rToast').hidden = true;
    c.hidden = false;
    card = null;
    $('dbgTxt').textContent = 'seed ' + r.seed + ' · replay this exact snap: ?seed=' + r.seed;
  }
  /* the card a player keeps: the play on turf, the result and the situation */
  function makeCard() {
    if (card) return card;
    var W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0f1c2b'); g.addColorStop(1, '#0a1420');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.font = 'italic 900 72px "Barlow Condensed", Inter, sans-serif'; x.textBaseline = 'top';
    x.fillStyle = '#f5b72a'; x.fillText('4TH', 60, 50); var w1 = x.measureText('4TH').width;
    x.fillStyle = '#19c6a7'; x.fillText('&', 60 + w1 + 6, 50); var w2 = x.measureText('&').width;
    x.fillStyle = '#fff'; x.fillText('WHAT', 60 + w1 + w2 + 12, 50);
    x.fillStyle = '#8fa2b8'; x.font = '700 34px Inter, sans-serif'; x.textAlign = 'right';
    x.fillText(A.sitText().down + ' · ' + A.sitText().spot, W - 60, 70); x.textAlign = 'left';
    var t = T.thumb(played, W - 120, 760, { distance: A.SC.distance });
    x.save(); x.beginPath(); x.roundRect ? x.roundRect(60, 160, W - 120, 760, 24) : x.rect(60, 160, W - 120, 760); x.clip();
    x.drawImage(t, 60, 160, W - 120, 760); x.restore();
    x.fillStyle = res.win ? '#36d399' : '#ef4b3f'; x.font = 'italic 900 120px "Barlow Condensed", Inter, sans-serif';
    x.fillText(res.title, 60, 960);
    x.fillStyle = '#fff'; x.font = '800 44px Inter, sans-serif';
    x.fillText((A.draft.name || A.nameFor(played)).slice(0, 34), 60, 1100);
    x.fillStyle = '#8fa2b8'; x.font = '600 36px Inter, sans-serif';
    var gained = res.outcome === 'incomplete' || res.outcome === 'throwaway' ? 'No gain' : (res.yards >= 0 ? 'Gained ' + res.yards : 'Lost ' + (-res.yards));
    x.fillText(gained + ' · vs ' + res.callName, 60, 1165);
    x.fillStyle = '#8fa2b8'; x.font = '700 30px Inter, sans-serif'; x.fillText('runthe.gg/4th-and-what', 60, 1260);
    card = c; return c;
  }
  function close3d() { $('watch').hidden = true; $('rCard').hidden = true; }
  $('rAgain').addEventListener('click', function () { snap(); });
  $('rEdit').addEventListener('click', function () { close3d(); A.show('studio', { mode: 'game' }); });
  $('rNew').addEventListener('click', function () {
    close3d();
    var f = A.draft.play.formation;
    A.setDraft({ play: A.emptyPlay(f), name: '', nameEdited: false, tag: 'pass', fav: false, notes: '', situations: [], ref: null });
    A.show('play');
  });
  $('rSave').addEventListener('click', function () {
    var r = A.draft.ref, b = r && A.signedIn() ? A.store.book(r.book) : null;
    if (b) { A.toast('rToast', 'It is already in ' + b.name + '. This snap counted in its stats.'); return; }
    A.saveDialog(A.copy(played), { distance: A.SC.distance, tag: A.draft.tag, done: function (bk, e) {
      A.draft.ref = { book: bk.id, id: e.id }; A.draft.name = e.name; A.draft.nameEdited = e.nameEdited; A.saveDraft();
      B.countSnap(e, res.distance, res.callKey, res.win); A.store.put(bk);
      A.toast('rToast', 'Saved to ' + bk.name + '.');
    } });
  });
  $('rCardBtn').addEventListener('click', function () {
    var c = makeCard();
    c.toBlob(function (blob) {
      if (!blob) return;
      var u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = (A.draft.name || A.nameFor(played)).replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-card.png'; a.click();
      setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
    });
  });
  $('rShare').addEventListener('click', function () {
    if (!res) return;
    SH.send(SH.text(res)).then(function (how) { A.toast('rToast', how === 'copied' ? 'Copied. Paste it anywhere.' : how === 'shared' ? 'Shared.' : how === 'cancelled' ? '' : 'Could not share from here.'); });
  });
  $('rBreak').addEventListener('click', function () { close3d(); A.show('replay'); window.FAW_GAME.load(res, played); });
  $('bClose3d').addEventListener('click', function () { $('rCard').hidden = true; });

  A.on('play', spotLine);
  A.on('studio', spotLine);

  window.FAW_FLOW = { pick: pick, snap: snap, last: function () { return res; }, card: makeCard };
})();
