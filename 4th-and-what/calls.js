/* 4th and What: the play call.
 *
 * The owner, 2026-11-13, approving the launch plan: play-call cards as the
 * main way to call a play, with drawing your own as the fourth card, and a
 * pre-snap read. So Play goes 4th and what? (the spot and the distance),
 * then Call it: the defense lines up and shows its shell, you are dealt three
 * cards (a run, a quick pass and a shot), you pick one, you snap it.
 *
 * Honest by construction. The snap's seed is fixed when the screen opens,
 * and the defense on the field is FAW_ENGINE.look() with that seed: exactly
 * what run() starts from, never the call or the blitz. The shell depends on
 * the seed and the situation only, so it is the same whichever card you
 * pick; the men line up over the card's formation. A quarter of snaps
 * disguise it (config.js shell.disguise), so the read is good, not certain.
 *
 * The hand is dealt from its own stream off the same seed, so a reload deals
 * the same three cards for the same snap. Concepts come from the route
 * library on every formation, both ways (FAW_TRIVIA.pool, the same pool
 * Daily Defense draws from). A sneak is only dealt at 4th and 1 or 2.
 *
 * Plain script: window.FAW_CALLS in the page, module.exports in node (the
 * deal and the read, tested in test/calls.test.mjs).
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var req = function (n, g) { return root[g] || (typeof require === 'function' ? require(n) : null); };
  var RNG = req('./rng.js', 'FAW_RNG'), TR = req('./trivia.js', 'FAW_TRIVIA');
  if (TR && TR.core) TR = TR.core;

  /* what a concept is, as a card */
  var TYPE = {
    'Inside Zone': 'run', 'Outside Zone': 'run', 'Power': 'run', 'Toss': 'run', 'QB Sneak': 'run',
    'Slant Flat': 'quick', 'Stick': 'quick', 'Snag': 'quick', 'Spacing': 'quick', 'Mesh': 'quick', 'Smash': 'quick',
    'Four Verts': 'shot', 'Dagger': 'shot', 'Flood': 'shot', 'Y Cross': 'shot', 'Levels': 'shot', 'Drive': 'shot', 'Curl Flat': 'shot'
  };
  var ORDER = ['run', 'quick', 'shot'];
  var LABEL = { run: 'Run', quick: 'Quick', shot: 'Shot' };

  /* deal(sc, seed): three cards, one of each kind, on three different sets
     where the pool allows */
  function deal(sc, seed) {
    var r = RNG.mulberry32(((seed >>> 0) ^ 0x2545f491) >>> 0), P = TR.pool(), used = {}, hand = [];
    var dist = Math.min(+sc.distance || 5, +sc.ballOn || 40);
    ORDER.forEach(function (t) {
      /* no run from Empty (there is no back), and a sneak only at 4th and 1 or 2 */
      var fit = P.filter(function (it) { return TYPE[it.concept] === t && !(t === 'run' && it.set === 'empty') && (it.concept !== 'QB Sneak' || dist <= 2); });
      var fresh = fit.filter(function (it) { return !used[it.set]; });
      var from = fresh.length ? fresh : fit, it = from[Math.floor(r() * from.length)];
      used[it.set] = true;
      hand.push({ type: t, label: LABEL[t], concept: it.concept, set: it.set, setName: it.setName, side: it.side, play: JSON.parse(JSON.stringify(it.play)) });
    });
    return hand;
  }

  /* the read, in the game's voice: what the shell is and how many are in the
     box (both from the engine), and what it usually means */
  var SHELL_TEXT = { two: 'Two deep', one: 'One deep', zero: 'Nobody deep' };
  var SHELL_HINT = { two: 'Light box. The run is there.', one: 'Safety in the box. Beat him outside.', zero: "They're bringing everybody. Get it out fast." };
  function readText(look) { return SHELL_TEXT[look.shell] + ' · ' + look.box + ' in the box'; }
  function hintText(look) { return SHELL_HINT[look.shell]; }

  /* after the snap, the read's answer: what they showed, and what it was */
  var SHOWED = { two: 'two deep', one: 'one deep', zero: 'nobody deep' };
  function revealText(res) {
    if (!res.shell || !res.callName) return '';
    return 'They showed ' + SHOWED[res.shell] + (res.disguised ? ' and rotated to ' + res.callName + '.' : '. It was ' + res.callName + '.');
  }

  var CORE = { TYPE: TYPE, LABEL: LABEL, deal: deal, readText: readText, hintText: hintText, revealText: revealText };
  if (isNode) { module.exports = CORE; return; }

  /* ================= the page ================= */
  var A = root.FAW_APP, E = root.FAW_ENGINE, T = root.FAW_TURF, FL = root.FAW_FLOW;
  var $ = function (id) { return document.getElementById(id); }, el = A.el;
  var seed = null, hand = [], pick = -1, V = null;

  function sitText() { var s = A.sitText(); return s.down + ' · ' + s.spot + (A.SC.level && A.SC.level !== 'nfl' ? ' · ' + A.levelShort(A.SC.level) : ''); }
  function current() { return pick >= 0 ? hand[pick].play : hand[0].play; }

  function open() {
    var s = FL.pending();
    if (s !== seed || !hand.length) { seed = s; hand = deal(A.SC, seed); pick = -1; }
    $('cSit').textContent = sitText();
    renderCards(); draw();
  }
  function draw() {
    var c = $('cField'), sc = A.SC, Y0 = 100 - sc.ballOn, p = current();
    if (!V) V = T.view(c, {});
    V.set({ BX: sc.ballX, Y0: Y0, marker: Math.min(100, Y0 + sc.distance), behind: 8, ahead: 19, across: T.across() });
    V.layout();
    var lk = E.look(sc, p, seed);
    $('cRead').textContent = readText(lk);
    $('cHint').textContent = hintText(lk);
    V.field().play(p, { offense: pick >= 0, defense: true, plans: lk.defense, coverage: false, distance: sc.distance, depths: pick >= 0 });
  }
  function renderCards() {
    var box = $('cCards'); box.textContent = '';
    hand.forEach(function (h, i) {
      box.appendChild(el('button', { type: 'button', class: 'ccard ' + h.type, 'aria-pressed': String(i === pick), on: { click: function () { choose(i); } } }, [
        el('span', { class: 'ctype', text: h.label }),
        T.thumb(h.play, 132, 84, { distance: A.SC.distance, reads: false }),
        el('b', { text: h.concept }),
        el('small', { text: h.setName })
      ]));
    });
    box.appendChild(el('button', { type: 'button', class: 'ccard own', on: { click: drawOwn } }, [
      el('span', { class: 'ctype', text: 'Yours' }), el('i', { class: 'cpen', text: '+' }), el('b', { text: 'Draw your own' }), el('small', { text: 'The full playbook' })
    ]));
    $('cSnap').disabled = pick < 0;
    $('cSnapTxt').textContent = pick < 0 ? 'Pick a play' : 'Snap it';
  }
  function choose(i) { pick = i; renderCards(); draw(); }
  function drawOwn() { A.show('studio', { mode: 'game' }); }
  function snapIt() {
    if (pick < 0) return;
    var h = hand[pick];
    FL.snap(h.play, h.concept + ' · ' + h.setName);
  }
  $('cSnap').addEventListener('click', snapIt);
  $('cBack').addEventListener('click', function () { A.show('play'); });
  A.on('call', open);
  window.addEventListener('resize', function () { if (!$('vCall').hidden && hand.length) draw(); });

  root.FAW_CALLS = { deal: deal, readText: readText, hintText: hintText, revealText: revealText, hand: function () { return hand; }, seed: function () { return seed; }, choose: choose };
})(typeof window !== 'undefined' ? window : this);
