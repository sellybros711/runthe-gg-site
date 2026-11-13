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
    $('sSit').textContent = s.down + ' · ' + s.spot + (A.SC.level && A.SC.level !== 'nfl' ? ' · ' + A.levelShort(A.SC.level) : '');
    renderLevel(); renderStrip();
    $('pDown').value = String(A.SC.down); $('pSide').value = A.SC.ballOn <= 50 ? 'opp' : 'own'; $('pYard').value = String(A.SC.ballOn <= 50 ? A.SC.ballOn : 100 - A.SC.ballOn);
    renderDists();
  }
  /* the level and the hash: High School, College or the NFL, the ball on a hash or in the middle */
  function renderLevel() {
    Array.prototype.forEach.call(document.querySelectorAll('#pLevel button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.level === (A.SC.level || 'nfl'))); });
    Array.prototype.forEach.call(document.querySelectorAll('#pHash button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.hash === (A.SC.hash || 'mid'))); });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#pLevel button'), function (b) { b.addEventListener('click', function () { A.setLevel(b.dataset.level); spotLine(); }); });
  Array.prototype.forEach.call(document.querySelectorAll('#pHash button'), function (b) { b.addEventListener('click', function () { A.setHash(b.dataset.hash); spotLine(); }); });
  /* A tile picks the distance; Play now goes (the owner's mockup, 2026-11-06) */
  function renderDists() {
    var box = $('pDists'); box.innerHTML = '';
    C.DISTANCES.forEach(function (d) {
      var goal = d >= A.SC.ballOn, cur = Math.min(d, A.SC.ballOn) === A.SC.distance;
      box.appendChild(el('button', { type: 'button', class: 'dist', 'data-d': String(d), 'aria-pressed': String(cur), on: { click: function () { choose(Math.min(d, A.SC.ballOn)); } } },
        [el('small', { text: A.ordinal(A.SC.down) + ' and' }), el('b', { text: goal ? 'Goal' : String(d) })]));
    });
  }
  function choose(d) { A.SC.distance = d; spotLine(); }
  /* Play now goes to Call it (calls.js): the defense's look and three cards */
  function pick(d) { if (d != null) A.SC.distance = d; spotLine(); A.show('call'); }
  $('pGo').addEventListener('click', function () { pick(); });

  /* THE STRIP: the whole field, your end zone on the left and theirs on the
     right, the ball where it is and the line to gain in front of it. Tap or
     drag it to spot the ball. Every number on it is the situation's. */
  function spotWord(ballOn) { return ballOn === 50 ? 'Midfield' : ballOn < 50 ? 'Opp ' + ballOn : 'Own ' + (100 - ballOn); }
  (function nums() {
    var box = $('pNums'); if (!box) return;
    for (var x = 10; x <= 90; x += 10) box.appendChild(el('span', { style: 'left:' + x + '%', text: String(x <= 50 ? x : 100 - x) }));
  })();
  function renderStrip() {
    var bx = 100 - A.SC.ballOn, gx = Math.min(100, bx + A.SC.distance), goal = A.SC.distance >= A.SC.ballOn;
    /* the ball's tag reads to its left and the line's to its right, kept inside the strip */
    $('pBall').style.left = bx + '%'; $('pBallTag').style.left = Math.max(14, bx) + '%';
    $('pGain').style.left = gx + '%'; $('pGainTag').style.left = Math.min(86, gx) + '%';
    $('pToGo').style.left = bx + '%'; $('pToGo').style.width = (gx - bx) + '%';
    $('pToGo').textContent = goal ? 'Goal' : A.SC.distance + ' yds';
    $('pBallTxt').textContent = '(' + spotWord(A.SC.ballOn) + ')';
    $('pGainTxt').textContent = goal ? '(Goal line)' : '(' + spotWord(A.SC.ballOn - A.SC.distance) + ')';
    $('pGainTag').querySelector('b').textContent = goal ? 'Score' : '1st down';
    /* a short distance puts the two tags on top of each other: push them
       apart by the overlap, half each way, so neither hides the other */
    var W = $('pTurf').offsetWidth, bt = $('pBallTag'), gt = $('pGainTag');
    var over = Math.max(14, bx) / 100 * W + 12 - (Math.min(86, gx) / 100 * W - 12) + 4;
    bt.style.marginLeft = over > 0 && W ? -over / 2 + 'px' : '';
    gt.style.marginLeft = over > 0 && W ? over / 2 + 'px' : '';
    $('pStrip').setAttribute('aria-valuenow', String(A.SC.ballOn)); $('pStrip').setAttribute('aria-valuetext', 'Ball on ' + spotWord(A.SC.ballOn));
  }
  /* the push apart needs the strip's width, which is 0 while Play is hidden */
  if (window.ResizeObserver && $('pTurf')) new ResizeObserver(function () { renderStrip(); }).observe($('pTurf'));
  function spotAt(clientX) {
    var r = $('pTurf').getBoundingClientRect(), f = (clientX - r.left) / r.width;
    var on = Math.round(100 - Math.max(0.01, Math.min(0.99, f)) * 100);
    if (on === A.SC.ballOn) return;
    A.SC.ballOn = on; A.SC.distance = Math.min(A.SC.distance, A.SC.ballOn); spotLine();
  }
  var sliding = false;
  $('pStrip').addEventListener('pointerdown', function (ev) { sliding = true; this.setPointerCapture && this.setPointerCapture(ev.pointerId); spotAt(ev.clientX); });
  $('pStrip').addEventListener('pointermove', function (ev) { if (sliding) spotAt(ev.clientX); });
  $('pStrip').addEventListener('pointerup', function () { sliding = false; });
  $('pStrip').addEventListener('pointercancel', function () { sliding = false; });
  $('pStrip').addEventListener('keydown', function (ev) {
    var k = ev.key === 'ArrowRight' ? -1 : ev.key === 'ArrowLeft' ? 1 : 0; if (!k) return;
    ev.preventDefault(); A.SC.ballOn = Math.max(1, Math.min(99, A.SC.ballOn + k)); A.SC.distance = Math.min(A.SC.distance, A.SC.ballOn); spotLine();
  });
  $('pMore').addEventListener('click', function () { $('pMoreBox').hidden = !$('pMoreBox').hidden; });
  ['pDown', 'pSide', 'pYard'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      A.SC.down = +$('pDown').value;
      var yd = +$('pYard').value; A.SC.ballOn = $('pSide').value === 'opp' ? yd : 100 - yd;
      A.SC.distance = Math.min(A.SC.distance, A.SC.ballOn);
      spotLine();
    });
  });
  /* the situation goes back to where it was picked: the daily's is the day's */
  $('sSit').addEventListener('click', function () { A.show(window.FAW_DAILY && window.FAW_DAILY.active() ? 'daily' : 'call'); });

  /* ---------- 2 and 3. Snap it, watch it ---------- */
  function ready(p) { return (p.handoff && p.handoff.to) || (p.targets && p.targets.length); }
  /* THE SNAP'S SEED is fixed before the snap, so the defense a player reads
     (Call it, and the draw screen) is the defense he plays: the daily's
     first snap is against the day's defense, ?seed= replays one, and every
     other snap gets a fresh one that is kept until it is played. */
  var pend = null;
  function pending() {
    var D = window.FAW_DAILY, ds = D && D.active() ? D.seed() : null;
    if (ds != null) return ds;
    var G = window.FAW_GO, gs = G ? G.seed() : null;
    if (gs != null) return gs;
    if (forced != null) return +forced >>> 0;
    if (pend == null) pend = RNG.freshSeed();
    return pend;
  }
  /* snap(play, name): a card's play, or the draft drawn in the Studio */
  var playedName = '';
  function snap(given, name) {
    var p = A.copy(given || A.draft.play);
    if (!ready(p)) { A.toast('sToast', 'Give it a read (Read, then tap a receiver) or make it a run first.'); $('sHint').textContent = 'Give it a read, or make it a run.'; return false; }
    var D = window.FAW_DAILY;
    if (window.FAW_FEEL) window.FAW_FEEL.unlock();
    var seed = pending(); forced = null; pend = null;
    played = p; playedName = name || A.draft.name || A.nameFor(p);
    if (window.FAW_CLIP) window.FAW_CLIP.cancel();
    res = E.run(A.SC, p, seed);
    if (D && D.active()) D.snapped(res, p);
    if (window.FAW_GO) window.FAW_GO.snapped(res);
    remember(res, p, D && D.active());
    /* a playbook play counts the snap against whatever the defense called */
    var r = A.draft.ref, b = r && A.signedIn() ? A.store.book(r.book) : null;
    if (b) b.plays.forEach(function (e) { if (e.id === r.id) { B.countSnap(e, res.distance, res.callKey, res.win, res.level); A.store.put(b); } });
    A.watch3d(res, showCard);
    return true;
  }
  $('sSnap').addEventListener('click', function () { snap(); });

  /* ---------- every snap you ran (the owner, 2026-11-01: "I ran 2 plays, I
     should be able to see the result of both") ----------
     Each snap is kept as its situation, its play and its seed, and replayed
     by the engine when you open it: same play, same seed, same result. The
     daily's list starts with the day's snap (kept by daily.js, so it is there
     after a reload); the rest are practice. Free play keeps its own list. */
  var LOG_MAX = 12, log = [], shown = null;
  function remember(r, p, daily) {
    var e = { sc: A.copy(A.SC), play: A.copy(p), seed: r.seed, win: r.win, yards: r.yards, outcome: r.outcome, daily: !!daily };
    log.push(e); if (log.length > LOG_MAX) log.shift();
    shown = e;
  }
  function snapsNow() {
    var D = window.FAW_DAILY, daily = !!(D && D.active());
    var list = log.filter(function (e) { return e.daily === daily; });
    if (daily) {
      var k = D.kept(), t = D.today();
      /* the day's snap from before a reload: rebuilt from what daily.js kept */
      if (k && k.drawn && k.seed != null && !list.some(function (e) { return e.seed === k.seed; })) {
        list.unshift({ sc: { down: 4, distance: Math.min(t.togo, t.ballOn), ballOn: t.ballOn, ballX: A.SC.ballX }, play: k.drawn, seed: k.seed, win: k.win, yards: k.yards, daily: true });
      }
    }
    return list.map(function (e, i) { return { e: e, label: daily ? (i === 0 ? 'Daily' : 'Practice ' + i) : 'Snap ' + (i + 1) }; });
  }
  function chipText(x) {
    var e = x.e, y = e.outcome === 'incomplete' || e.outcome === 'throwaway' ? 'no gain' : (e.yards > 0 ? '+' + e.yards : String(e.yards));
    return x.label + ' · ' + (e.win ? 'First down' : 'Stopped') + ' ' + y;
  }
  function openSnap(e) {
    Object.keys(e.sc).forEach(function (k) { A.SC[k] = e.sc[k]; });
    var r = E.run(A.SC, e.play, e.seed);
    res = r; played = A.copy(e.play); shown = e;
    $('watch').hidden = true; $('rCard').hidden = true;
    if (A.current() !== 'replay') A.show('replay');
    window.FAW_GAME.load(r, e.play);
    renderSnaps();
  }
  function renderSnaps() {
    var list = snapsNow();
    ['rSnaps', 'gSnaps'].forEach(function (id) {
      var box = $(id); if (!box) return;
      box.innerHTML = '';
      box.hidden = list.length < 2;
      if (list.length < 2) return;
      box.appendChild(el('span', { class: 'rsnapsh', text: 'Your snaps' }));
      list.forEach(function (x) {
        box.appendChild(el('button', { type: 'button', class: 'snapchip ' + (x.e.win ? 'win' : 'lose'), 'aria-pressed': String(x.e === shown || (shown && x.e.seed === shown.seed && x.e.daily === shown.daily)),
          text: chipText(x), on: { click: function () { openSnap(x.e); } } }));
      });
    });
  }

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
    if (window.FAW_DAILY) window.FAW_DAILY.card(r);
    if (window.FAW_GO) window.FAW_GO.card(r);
    renderSnaps();
    clipFor(r);
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
    x.fillText(playedName.slice(0, 34), 60, 1100);
    x.fillStyle = '#8fa2b8'; x.font = '600 36px Inter, sans-serif';
    var gained = res.outcome === 'incomplete' || res.outcome === 'throwaway' ? 'No gain' : (res.yards >= 0 ? 'Gained ' + res.yards : 'Lost ' + (-res.yards));
    x.fillText(gained + ' · vs ' + res.callName, 60, 1165);
    x.fillStyle = '#8fa2b8'; x.font = '700 30px Inter, sans-serif'; x.fillText('runthe.gg/4th-and-what', 60, 1260);
    card = c; return c;
  }
  function close3d() { $('watch').hidden = true; $('rCard').hidden = true; }
  /* Run it back: the same play against a fresh defense, at once */
  $('rAgain').addEventListener('click', function () { snap(played, playedName); });
  /* Edit play: the play just snapped, on the draw screen */
  $('rEdit').addEventListener('click', function () {
    close3d();
    if (JSON.stringify(played) !== JSON.stringify(A.draft.play)) A.setDraft({ play: A.copy(played), name: '', nameEdited: false, tag: A.tagOf(played), fav: false, notes: '', situations: [], ref: null });
    A.show('studio', { mode: 'game' });
  });
  /* New play: a new look and a new hand */
  $('rNew').addEventListener('click', function () { close3d(); A.show('call'); });
  $('rSave').addEventListener('click', function () {
    var r = A.draft.ref, b = r && A.signedIn() ? A.store.book(r.book) : null;
    if (b) { A.toast('rToast', 'It is already in ' + b.name + '. This snap counted in its stats.'); return; }
    A.saveDialog(A.copy(played), { distance: A.SC.distance, tag: A.draft.tag, done: function (bk, e) {
      A.draft.ref = { book: bk.id, id: e.id }; A.draft.name = e.name; A.draft.nameEdited = e.nameEdited; A.saveDraft();
      B.countSnap(e, res.distance, res.callKey, res.win, res.level); A.store.put(bk);
      A.toast('rToast', 'Saved to ' + bk.name + '.');
    } });
  });
  $('rCardBtn').addEventListener('click', function () {
    var c = makeCard();
    c.toBlob(function (blob) {
      if (!blob) return;
      var u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = playedName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-card.png'; a.click();
      setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
    });
  });
  /* THE CLIP (the owner, 2026-11-06: "when u share a play with someone, it
     should share the video of the play"). It is recorded behind the card as
     soon as the card shows (clip.js), so Share can hand the phone the file in
     the moment of the tap. Still recording: the button says so, then asks
     for one more tap. A browser that cannot record shares the line alone. */
  var CL = window.FAW_CLIP;
  function shareLine() { var D = window.FAW_DAILY; return D && D.active() ? D.share(res) : SH.text(res); }
  function clipName() { return (playedName || '4th-and-what').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }
  function clipFor(r) {
    $('rShare').textContent = 'Share';
    if (!CL || !CL.supported()) return;
    var gained = r.outcome === 'incomplete' || r.outcome === 'throwaway' ? 'No gain' : (r.yards >= 0 ? 'Gained ' + r.yards : 'Lost ' + (-r.yards));
    var D = window.FAW_DAILY, s = A.sitText();
    CL.start(r, { situation: (D && D.active() ? 'Daily #' + D.number() + ' · ' : '') + s.down + ' · ' + s.spot,
      name: A.draft.name || A.nameFor(played), title: r.title, line: gained + ' · vs ' + r.callName, win: r.win });
  }
  $('rShare').addEventListener('click', function () {
    if (!res) return;
    if (CL && CL.supported()) {
      var c = CL.ready();
      if (c) {
        SH.sendVideo(c, shareLine(), clipName()).then(function (how) { A.toast('rToast', how === 'shared' ? 'Shared.' : how === 'saved' ? 'Video saved. The line is copied too.' : how === 'cancelled' ? '' : 'Could not share from here.'); });
        return;
      }
      $('rShare').textContent = 'Making video…'; $('rShare').disabled = true;
      CL.whenReady().then(function (made) {
        $('rShare').disabled = false;
        $('rShare').textContent = made ? 'Send video' : 'Share';
        if (!made) SH.send(shareLine()).then(function (how) { A.toast('rToast', how === 'copied' ? 'Copied. Paste it anywhere.' : how === 'shared' ? 'Shared.' : ''); });
      });
      return;
    }
    SH.send(shareLine()).then(function (how) { A.toast('rToast', how === 'copied' ? 'Copied. Paste it anywhere.' : how === 'shared' ? 'Shared.' : how === 'cancelled' ? '' : 'Could not share from here.'); });
  });
  $('rBreak').addEventListener('click', function () { close3d(); A.show('replay'); window.FAW_GAME.load(res, played); });
  $('bClose3d').addEventListener('click', function () { $('rCard').hidden = true; });

  A.on('play', spotLine);
  A.on('replay', renderSnaps);
  A.on('studio', spotLine);

  window.FAW_FLOW = { snaps: snapsNow, openSnap: openSnap, refresh: spotLine, pick: pick, snap: snap, pending: pending, last: function () { return res; }, card: makeCard };
})();
