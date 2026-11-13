/* 4th and What: Go For It, the run.
 *
 * The owner, 2026-11-13, approving the launch plan: Go For It runs are the
 * main mode. A run is 4th down after 4th down. Convert and you go again from
 * where the ball ended, a little further to go each time (LADDER, by how many
 * you have converted). A touchdown starts a new drive from your own 25.
 *
 * STOPS stops end the run, not one. The plan said one; measured on the real
 * engine (2026-11-13, 200 runs each), one stop ended 58% of runs on the first
 * snap and a good reader averaged about one conversion, which is no streak at
 * all. With three stops and this ladder a random picker averages 2.3, a
 * reader of the shell 3.3 and a near perfect caller 5.4, over 5 to 8 snaps.
 * A stop is a turnover on downs: the next possession starts from your own 35,
 * and the ladder keeps climbing. An interception costs PICK stops (2): on
 * one 4th down a pick and an incompletion are the same turnover, so in a run
 * it has to cost more, or throwing into coverage would be free. The headline is how many you converted; the
 * yards and the touchdowns are the rest of the story. Your best run is kept.
 *
 * Every snap is a real snap: Call it with the run's own seed (the look is the
 * snap), the NFL, from the middle of the field. Nothing is rigged: the ladder
 * only sets the distance, never the defense.
 *
 * The run in progress is kept on the device with the seed of the next snap,
 * so a reload resumes the same down against the same look. It cannot be
 * re-rolled by refreshing.
 *
 * Plain script: window.FAW_GO in the page, module.exports in node (the rules,
 * tested in test/goforit.test.mjs).
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  /* the distance by how many you have converted so far */
  var LADDER = [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 10, 12, 15];
  var START = 65, AFTER_TD = 75, STOPS = 3, PICK = 2;

  function distanceFor(n, ballOn) { return Math.max(1, Math.min(LADDER[Math.min(n, LADDER.length - 1)], ballOn)); }
  function newRun(seed) { return { n: 0, stops: 0, yards: 0, tds: 0, ballOn: START, distance: distanceFor(0, START), seed: seed >>> 0, log: [], over: false }; }
  /* the run after a snap: where the ball ended (the engine's spot), or over */
  function after(st, res, nextSeed) {
    var s = JSON.parse(JSON.stringify(st));
    var td = res.outcome === 'touchdown';
    s.log.push({ distance: s.distance, ballOn: s.ballOn, win: !!res.win, yards: res.yards, td: td, seed: res.seed, callKey: res.callKey });
    if (!res.win) {
      s.stops = (s.stops || 0) + (res.outcome === 'interception' ? PICK : 1);
      if (s.stops >= STOPS) { s.over = true; return s; }
      s.ballOn = START;
    } else {
      s.n++; s.yards += Math.max(0, Math.round(res.yards));
      if (td) { s.tds++; s.ballOn = AFTER_TD; }
      else s.ballOn = Math.max(1, Math.min(99, res.spotY != null ? Math.round(100 - res.spotY) : s.ballOn - Math.round(res.yards)));
    }
    s.distance = distanceFor(s.n, s.ballOn);
    s.seed = nextSeed >>> 0;
    return s;
  }
  /* is a better than b: more in a row, then more yards */
  function better(a, b) { return !b || a.n > b.n || (a.n === b.n && a.yards > b.yards); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function tallyText(s) { return s.n + ' converted · ' + s.yards + ' yds' + (s.tds ? ' · ' + plural(s.tds, 'TD', 'TDs') : ''); }
  function stopsLeft(s) { return Math.max(0, STOPS - (s.stops || 0)); }
  function overText(s) {
    if (!s.n) return 'Not one converted. Shake it off.';
    return plural(s.n, '4th down', '4th downs') + ' converted. ' + s.yards + ' yards' + (s.tds ? ', ' + plural(s.tds, 'touchdown', 'touchdowns') : '') + '.';
  }
  function shareText(s) { return '4th and What · Go For It\n' + overText(s) + '\nhttps://runthe.gg/4th-and-what#play'; }

  var CORE = { LADDER: LADDER, START: START, AFTER_TD: AFTER_TD, STOPS: STOPS, PICK: PICK, stopsLeft: stopsLeft, distanceFor: distanceFor, newRun: newRun, after: after, better: better, tallyText: tallyText, overText: overText, shareText: shareText };
  if (isNode) { module.exports = CORE; return; }

  /* ================= the page ================= */
  var A = root.FAW_APP, E = root.FAW_ENGINE, RNG = root.FAW_RNG;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'faw_go_run', BEST = 'faw_go_best', SEEN = 'faw_go_seen';
  var st = null, active = false, stash = null, wasBest = false;

  function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  st = load(KEY); if (st && st.over) st = null;

  function apply() {
    A.SC.down = 4; A.SC.ballOn = st.ballOn; A.SC.distance = st.distance;
    A.SC.level = 'nfl'; A.SC.hash = 'mid'; A.SC.ballX = E.FIELD_W / 2;
  }
  function enter() {
    if (root.FAW_DAILY && root.FAW_DAILY.leave) root.FAW_DAILY.leave();
    if (!active) { stash = A.copy(A.SC); active = true; document.body.classList.add('gofor'); }
    apply(); renderPlay();
    A.show('call');
  }
  /* a player's very first snap in Go For It gets the first hand (calls.js FIRST) */
  function start() { st = newRun(RNG.freshSeed()); st.first = !load(SEEN); save(KEY, st); wasBest = false; enter(); }
  function firstHand() { return active && st && st.first && !st.log.length; }
  function leave() {
    if (!active) return;
    active = false; document.body.classList.remove('gofor');
    if (stash) { Object.keys(stash).forEach(function (k) { A.SC[k] = stash[k]; }); stash = null; }
    if (root.FAW_FLOW && root.FAW_FLOW.refresh) root.FAW_FLOW.refresh();
    renderPlay();
  }
  /* flow.js asks for the next snap's seed, and tells it the result */
  function seed() { return active && st && !st.over ? st.seed : null; }
  function snapped(res) {
    if (!active || !st || st.over) return;
    st = after(st, res, RNG.freshSeed());
    save(SEEN, 1);
    if (st.over) {
      var b = load(BEST); wasBest = better(st, b) && st.n > 0;
      if (wasBest) save(BEST, { n: st.n, yards: st.yards, tds: st.tds, at: new Date().toISOString().slice(0, 10) });
      save(KEY, null);
    } else { save(KEY, st); apply(); }
  }
  /* the result card's Go For It block */
  function card(res) {
    var c = $('rCard'), box = $('rGo'); if (!box) return;
    c.classList.toggle('go', active);
    box.hidden = !active;
    if (!active || !st) return;
    $('rGoTally').textContent = tallyText(st);
    if (st.over) {
      $('rGoHead').textContent = 'Run over';
      $('rGoNext').textContent = overText(st) + (wasBest ? ' New best.' : '');
    } else {
      var left = stopsLeft(st);
      $('rGoHead').textContent = res.outcome === 'touchdown' ? 'Touchdown. New drive.' : res.win ? 'Moving the chains' : (res.outcome === 'interception' ? 'Picked. That costs two. ' : 'Stopped. ') + plural(left, 'stop', 'stops') + ' left.';
      var s = A.sitText();
      $('rGoNext').textContent = 'Next: ' + s.down + ' · ' + s.spot;
    }
    $('rGoOn').hidden = st.over; $('rGoAgain').hidden = !st.over; $('rGoShare').hidden = !st.over;
  }
  /* the Play screen's Go For It panel: start, resume, and your best */
  function renderPlay() {
    var b = load(BEST), live = st && !st.over;
    $('goStart').querySelector('span').textContent = live ? 'Resume run' : 'Go for it';
    $('goSub').textContent = live ? 'On a run: ' + tallyText(st) + '.' : "Convert 4th down after 4th down. Three stops and you're done.";
    $('goBest').textContent = b ? 'Best: ' + tallyText(b) : '';
    $('goBest').hidden = !b;
    var chip = $('cRun'); if (chip) { chip.hidden = !active || !st; if (active && st) chip.textContent = tallyText(st) + ' · ' + '\u25CF'.repeat(stopsLeft(st)) + '\u25CB'.repeat(STOPS - stopsLeft(st)); }
  }
  function close3d() { $('watch').hidden = true; $('rCard').hidden = true; }

  $('goStart').addEventListener('click', function () { if (st && !st.over) enter(); else start(); });
  $('rGoOn').addEventListener('click', function () { close3d(); enter(); });
  $('rGoAgain').addEventListener('click', function () { close3d(); start(); });
  $('rGoShare').addEventListener('click', function () {
    var t = shareText(st);
    if (navigator.share) navigator.share({ text: t }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { A.toast('rToast', 'Copied. Paste it anywhere.'); });
  });
  A.on('call', renderPlay);
  ['play', 'home', 'daily', 'trivia', 'books', 'learn', 'test', 'print'].forEach(function (v) { A.on(v, leave); });
  renderPlay();
  /* a reload in the middle of a run (the page opens on #call) picks the run
     back up on the same down, against the same look */
  window.addEventListener('DOMContentLoaded', function () { if (location.hash === '#call' && st && !st.over) enter(); });

  root.FAW_GO = { firstHand: firstHand, active: function () { return active; }, run: function () { return st; }, seed: seed, snapped: snapped, card: card, start: start, enter: enter, leave: leave, core: CORE };
})(typeof window !== 'undefined' ? window : this);
