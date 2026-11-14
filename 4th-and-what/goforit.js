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
 * TODAY'S RUN (the launch plan, Phase 2): one run a day, the same for
 * everybody. Snap k of the day's run is seeded from the Eastern day and k
 * (dailySeed), so two players who make the same calls see the same looks and
 * the same hands. The first run of the day that ends is posted to the board
 * (supabase/169) when signed in; runs after it are ordinary runs.
 *
 * Plain script: window.FAW_GO in the page, module.exports in node (the rules,
 * tested in test/goforit.test.mjs).
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var RNG = isNode ? require('./rng.js') : root.FAW_RNG;

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
  /* the day's run: snap k's seed, the same on every device */
  function dailySeed(day, k) { return RNG.hashStr('faw-go-daily-' + day + '-' + k) >>> 0; }
  /* what the board keeps of a finished run (supabase/169 faw_go_submit) */
  function postOf(s) {
    return { converted: s.n, yards: s.yards, tds: s.tds, snaps: s.log.length,
      log: s.log.map(function (l) { return { seed: l.seed, callKey: l.callKey, win: l.win, yards: l.yards }; }) };
  }
  function shareText(s, rank) { return '4th and What · ' + (s.daily ? "Today's run" : 'Go For It') + '\n' + overText(s) + (rank ? '\nNumber ' + rank + ' on the board.' : '') + '\nhttps://runthe.gg/4th-and-what#play'; }

  var CORE = { dailySeed: dailySeed, postOf: postOf, LADDER: LADDER, START: START, AFTER_TD: AFTER_TD, STOPS: STOPS, PICK: PICK, stopsLeft: stopsLeft, distanceFor: distanceFor, newRun: newRun, after: after, better: better, tallyText: tallyText, overText: overText, shareText: shareText };
  if (isNode) { module.exports = CORE; return; }

  /* ================= the page ================= */
  var A = root.FAW_APP, E = root.FAW_ENGINE, RNG = root.FAW_RNG;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'faw_go_run', BEST = 'faw_go_best', SEEN = 'faw_go_seen';
  var st = null, active = false, stash = null, wasBest = false, posted = null;
  var D = root.FAW_DAILY;
  function today() { return D && D.day ? D.day() : new Date().toISOString().slice(0, 10); }
  function dayKey(d) { return 'faw_go_day_' + d; }
  /* the board (supabase/169); a check swaps in its own stand-in */
  var API = root.FAW_GO_API || {
    submit: function (d, p) { return D.rpc('faw_go_submit', { p_day: d, p_converted: p.converted, p_yards: p.yards, p_tds: p.tds, p_snaps: p.snaps, p_log: p.log }, true); },
    board: function (d) { return D.rpc('faw_go_board', { p_day: d, p_limit: 5 }); },
    signedIn: function () { return D && D.signedIn ? D.signedIn() : false; }
  };

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
  function firstHand() { return active && st && st.first && !st.daily && !st.log.length; }
  /* today's run: the day's seeds, once; played already, it is an ordinary run */
  function startDaily() {
    var d = today();
    if (load(dayKey(d))) { start(); return; }
    st = newRun(dailySeed(d, 0)); st.daily = d; save(KEY, st); wasBest = false; posted = null; enter();
  }
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
    st = after(st, res, st.daily ? dailySeed(st.daily, st.log.length + 1) : RNG.freshSeed());
    save(SEEN, 1);
    if (st.over) {
      var b = load(BEST); wasBest = better(st, b) && st.n > 0;
      if (wasBest) save(BEST, { n: st.n, yards: st.yards, tds: st.tds, at: new Date().toISOString().slice(0, 10) });
      save(KEY, null);
      if (st.daily && !load(dayKey(st.daily))) post(st);
    } else { save(KEY, st); apply(); }
  }
  /* today's run is kept on the device, then posted (signed in) and the board read */
  function post(s) {
    var d = s.daily, p = postOf(s);
    save(dayKey(d), { n: s.n, yards: s.yards, tds: s.tds });
    posted = { pending: true };
    var go = API.signedIn() ? API.submit(d, p) : Promise.resolve(null);
    go.then(function (r) {
      if (r && r.rank) { posted.rank = r.rank; posted.players = r.players; var k = load(dayKey(d)) || {}; k.rank = r.rank; save(dayKey(d), k); }
      return API.board(d);
    }).then(function (b) { posted.pending = false; posted.board = Array.isArray(b) ? b : null; renderBoard(); renderPlay(); })
      .catch(function () { posted.pending = false; renderBoard(); });
    renderBoard();
  }
  function renderBoard() {
    var box = $('rGoBoard'); if (!box) return;
    box.hidden = !(active && st && st.over && st.daily);
    if (box.hidden) return;
    box.textContent = '';
    var el = A.el;
    box.appendChild(el('p', { class: 'rgbhead', text: "Today's board" + (posted && posted.rank ? ' · you are number ' + posted.rank + ' of ' + posted.players : '') }));
    if (!API.signedIn()) box.appendChild(el('p', { class: 'rgbnote', text: 'Sign in to get on the board. Your run is kept on this device.' }));
    if (posted && posted.pending) { box.appendChild(el('p', { class: 'rgbnote', text: 'Posting your run.' })); return; }
    (posted && posted.board || []).forEach(function (row) {
      box.appendChild(el('p', { class: 'rgbrow' + (row.mine ? ' mine' : ''), text: row.rank + '. ' + row.username + ' · ' + row.converted + ' converted · ' + row.yards + ' yds' }));
    });
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
    if (st.over && st.daily) $('rGoHead').textContent = "Today's run is in";
    renderBoard();
  }
  /* the Play screen's Go For It panel: start, resume, and your best */
  function renderPlay() {
    var b = load(BEST), live = st && !st.over;
    $('goStart').querySelector('span').textContent = live && !st.daily ? 'Resume run' : 'Go for it';
    $('goSub').textContent = live ? 'On a run: ' + tallyText(st) + '.' : "Convert 4th down after 4th down. Three stops and you're done.";
    $('goBest').textContent = b ? 'Best: ' + tallyText(b) : '';
    $('goBest').hidden = !b;
    var dk = load(dayKey(today()));
    $('goDaily').querySelector('span').textContent = dk ? "Today's run is in" : "Today's run";
    $('goDailySub').textContent = dk ? dk.n + ' converted · ' + dk.yards + ' yds' + (dk.rank ? ' · number ' + dk.rank + ' on the board' : '') + '. Back tomorrow.' : 'Same downs for everybody. One shot at the board.';
    var chip = $('cRun'); if (chip) { chip.hidden = !active || !st; if (active && st) chip.textContent = tallyText(st) + ' · ' + '\u25CF'.repeat(stopsLeft(st)) + '\u25CB'.repeat(STOPS - stopsLeft(st)); }
  }
  function close3d() { $('watch').hidden = true; $('rCard').hidden = true; }

  $('goStart').addEventListener('click', function () { if (st && !st.over && !st.daily) enter(); else start(); });
  $('goDaily').addEventListener('click', function () {
    if (st && !st.over && st.daily) { enter(); return; }
    if (load(dayKey(today()))) return;
    startDaily();
  });
  $('rGoOn').addEventListener('click', function () { close3d(); enter(); });
  $('rGoAgain').addEventListener('click', function () { close3d(); start(); });
  $('rGoShare').addEventListener('click', function () {
    var t = shareText(st, posted && posted.rank);
    if (navigator.share) navigator.share({ text: t }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { A.toast('rToast', 'Copied. Paste it anywhere.'); });
  });
  A.on('call', renderPlay);
  ['play', 'home', 'daily', 'trivia', 'books', 'learn', 'test', 'print'].forEach(function (v) { A.on(v, leave); });
  renderPlay();
  /* a reload in the middle of a run (the page opens on #call) picks the run
     back up on the same down, against the same look */
  window.addEventListener('DOMContentLoaded', function () { if (location.hash === '#call' && st && !st.over) enter(); });

  root.FAW_GO = { startDaily: startDaily, posted: function () { return posted; }, firstHand: firstHand, active: function () { return active; }, run: function () { return st; }, seed: seed, snapped: snapped, card: card, start: start, enter: enter, leave: leave, core: CORE };
})(typeof window !== 'undefined' ? window : this);
