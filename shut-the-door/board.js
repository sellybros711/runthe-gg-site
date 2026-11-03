/* Shut The Door: the day's board. window.STD_BOARD.
 *
 * A screen of its own (#s-board), opened from a button on the result screen,
 * the home links and the menu. Never opened by itself.
 *
 * The rows are shutdoor_board(day, limit)'s (supabase/153_shut_the_door.sql),
 * read through STD_AUTH.board(): {rank, username, outcome, pitches, score,
 * percentile, pitched_like, strip, mine, players}. The top rows, and the
 * caller's own row wherever it is. Every number on this screen is one of
 * those fields: the rank, the total, the pitches and the score. Nothing is
 * worked out here.
 *
 * Signed out the board still reads (the call is public), with one quiet line
 * and a sign in button under it. No modal, no sheet that opens by itself.
 *
 * peek() fills the home's today's top 3 (#h-top) from the same call.
 *
 * The mock (mock-api.js) serves a fictional board on ?mockBoard=:
 *   (any) a full board   empty  no rows   fail  the call answers null
 *   deep  your row far below the top
 */
(function () {
'use strict';
var C = window.STD_CONTRACT;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

var LIMIT = 50;
var WAIT_MS = 300, GIVE_UP_MS = 16000;
var ctx = { day: null, scn: null, before: null, onBack: null, onSignIn: null, onPlay: null, pending: null, saveLabel: null, played: function () { return false; } };
var seq = 0;

function authState() {
  var A = window.STD_AUTH, st = {};
  try { st = (A && A.state && A.state()) || {}; } catch (e) { st = {}; }
  return st;
}

/* the outcome as its chip: the contract's label, its colour from the outcome */
function chip(outcome) {
  var label = C.OUTCOME_LABEL[outcome];
  if (!label) return '<span class="oc none">-</span>';
  return '<span class="oc ' + esc(outcome) + '">' + esc(label.toLowerCase()) + '</span>';
}

function head() {
  var s = ctx.scn;
  $('bd-eyebrow').textContent = 'today · ' + (s && s.preview ? 'preview' : s ? '#' + s.number : '');
}

/* the ink panel: your rank out of the total, or why you are not on it */
function renderYou(rows, st) {
  var el = $('bd-you');
  var mine = null;
  (rows || []).forEach(function (r) { if (r.mine) mine = r; });
  if (mine) {
    el.innerHTML =
      '<div class="bd-rank"><b>#' + esc(mine.rank) + '</b><span>your rank today</span></div>' +
      '<div class="bd-me">' + chip(mine.outcome) +
      '<span class="fact"><b>' + esc(mine.pitches) + '</b>' + (mine.pitches === 1 ? 'pitch' : 'pitches') + '</span>' +
      '<span class="fact"><b>' + esc(mine.score) + '</b>score</span></div>';
    return;
  }
  /* the count of closers is said once, in the list's header (the owner, 2026-10-30) */
  var count = '';
  if (!st.signedIn) {
    /* a daily finished signed out is on this device, not on the board: say why, with the result's
       own button (modes-ui.js). Signing in posts it once (api.js claim). */
    var owed = ctx.pending ? ctx.pending() : null;
    el.innerHTML = count + (owed && ctx.saveLabel
      ? '<div class="bd-in"><p>you played as a guest, so your score isn\'t on the leaderboard. sign in to save it.</p>' +
        '<button class="btn save-b" type="button" id="bd-signin">' + esc(ctx.saveLabel) + '</button></div>'
      : '<div class="bd-in"><p>sign in to put your outing on the leaderboard.</p>' +
        '<button class="btn dk" type="button" id="bd-signin">sign in</button></div>');
    $('bd-signin').addEventListener('click', function () { if (ctx.onSignIn) ctx.onSignIn(); });
    return;
  }
  var played = ctx.played();
  el.innerHTML = count +
    '<div class="bd-in"><p>' + (played ? 'your outing is not on it yet. check back in a minute.' : 'you are not on it yet. finish today\'s daily to post.') + '</p>' +
    (played ? '' : '<button class="btn take sm" type="button" id="bd-play">take the mound</button>') + '</div>';
  if (!played) $('bd-play').addEventListener('click', function () { if (ctx.onPlay) ctx.onPlay(); });
}

/* the row's plate (plate.js): the club key and initials the server answers, the neutral plate without */
function plateOf(r) {
  var PL = window.STD_PLATE;
  return PL ? PL.svg(r.plate || null, PL.initials(r.username === 'Closer' ? '' : r.username, r.initials), { cls: 'bp' }) : '';
}
function rowHTML(r) {
  return '<li class="' + (r.mine ? 'mine' : '') + (r.rank <= 3 ? ' top' : '') + '">' +
    '<span class="rk">' + esc(r.rank) + '</span>' +
    '<span class="nm">' + plateOf(r) + '<i class="un">' + esc(r.username) + '</i>' + (r.mine ? '<em>you</em>' : '') + '</span>' +
    chip(r.outcome) +
    '<span class="n">' + esc(r.pitches) + '</span>' +
    '<span class="n sc">' + esc(r.score) + '</span></li>';
}

function renderList(rows) {
  var el = $('bd-list');
  if (!rows.length) {
    el.innerHTML = '<div class="bd-empty"><img src="brand/mark.svg?v=2" alt="" width="56" height="56">' +
      '<b>nobody\'s on it yet</b><p>no outings posted today. be the first.</p></div>';
    return;
  }
  /* the top rows, then a gap and your own row when it sits below them */
  var html = '', prev = 0;
  rows.forEach(function (r) {
    if (prev && r.rank > prev + 1) html += '<li class="gap" aria-hidden="true"><span>···</span></li>';
    html += rowHTML(r);
    prev = r.rank;
  });
  var n = rows[0].players;
  el.innerHTML = '<div class="bd-lh"><b>top closers</b><span class="bd-n">' + esc(n) + ' ' + (n === 1 ? 'closer' : 'closers') + ' today</span></div>' +
    '<div class="bd-cols-h" aria-hidden="true"><span>#</span><span>closer</span><span>result</span><span>p</span><span>score</span></div>' +
    '<ol class="bd-rows">' + html + '</ol>';
}

function renderState(kind) {
  var el = $('bd-list');
  if (kind === 'loading') {
    el.innerHTML = '<div class="bd-empty"><img class="load-mark" src="brand/mark.svg?v=2" alt="" width="56" height="56"><p>loading the leaderboard.</p></div>';
    $('bd-you').innerHTML = '';
    return;
  }
  el.innerHTML = '<div class="bd-empty"><b>the leaderboard did not load</b><p>your outing is safe. try again.</p>' +
    '<button class="btn ghost" type="button" id="bd-retry">try again</button></div>';
  $('bd-you').innerHTML = '';
  $('bd-retry').addEventListener('click', load);
}

/* ask for the rows. supabase-js arrives deferred, so while auth.js says it is
   still waiting, wait with it rather than call a failure */
function fetchRows(my, limit, live) {
  var A = window.STD_AUTH;
  var t0 = Date.now();
  live = live || function () { return my === seq; };
  return new Promise(function (res) {
    (function go() {
      if (!live()) return res(undefined);
      var st = authState();
      if (st.waiting && Date.now() - t0 < GIVE_UP_MS) { setTimeout(go, WAIT_MS); return; }
      if (!A || !A.board) return res(null);
      Promise.resolve().then(function () { return A.board(ctx.day, limit || LIMIT); }).then(res, function () { res(null); });
    })();
  });
}

function load() {
  var my = ++seq;
  head();
  renderState('loading');
  var before = ctx.before ? Promise.resolve().then(ctx.before).catch(function () {}) : Promise.resolve();
  return before.then(function () { return fetchRows(my); }).then(function (rows) {
    if (my !== seq || rows === undefined) return;
    if (!Array.isArray(rows)) { renderState('fail'); return; }
    rows = rows.slice().sort(function (a, b) { return a.rank - b.rank; });
    renderYou(rows, authState());
    renderList(rows);
  });
}

/* TODAY'S TOP 3 on the home's daily tab (the owner, 2026-11-03): the same rows as the board, ranked by
   the same score, cut to the top three. The board is public and never hidden before you play, so
   neither is this. It is read only while the daily tab shows; a failed or empty read is one quiet
   line, never an error. The box keeps one height in every state, so nothing under it moves. */
var PEEK = 3, pseq = 0, peeked = null;
function peekLine(t) { return '<p class="hb-say">' + t + '</p>'; }
function peek() {
  var el = $('h-top-body');
  if (!el) return;
  if (peeked && peeked.day === ctx.day && Date.now() - peeked.at < 30000) return;
  var my = ++pseq;
  if (!peeked) el.innerHTML = peekLine('loading the leaderboard.');
  fetchRows(my, PEEK, function () { return my === pseq; }).then(function (rows) {
    if (my !== pseq || rows === undefined) return;
    var n = $('h-top-n');
    if (!Array.isArray(rows)) { peeked = null; n.textContent = ''; el.innerHTML = peekLine('the leaderboard shows here once it can load.'); return; }
    peeked = { day: ctx.day, at: Date.now() };
    rows = rows.filter(function (r) { return r.rank <= PEEK; }).sort(function (a, b) { return a.rank - b.rank; });
    if (!rows.length) { n.textContent = ''; el.innerHTML = peekLine('nobody\'s on it yet. be the first.'); return; }
    var c = rows[0].players;
    n.textContent = c + ' ' + (c === 1 ? 'closer' : 'closers') + ' today';
    el.innerHTML = '<div class="bd-cols-h hb-cols" aria-hidden="true"><span>#</span><span>closer</span><span>score</span></div>' +
      '<ol class="bd-rows hb-rows">' + rows.map(function (r) {
        return '<li class="top' + (r.mine ? ' mine' : '') + '"><span class="rk">' + esc(r.rank) + '</span>' +
          '<span class="nm">' + plateOf(r) + '<i class="un">' + esc(r.username) + '</i>' + (r.mine ? '<em>you</em>' : '') + '</span><span class="n sc">' + esc(r.score) + '</span></li>';
      }).join('') + '</ol>' + (rows.length < PEEK ? peekLine('only ' + rows.length + ' on it so far.') : '');
  });
}

function wire() {
  $('bd-back').addEventListener('click', function () { seq++; if (ctx.onBack) ctx.onBack(); });
}

var api = {
  API_VERSION: 1,
  init: function (c) { for (var k in c) ctx[k] = c[k]; if (!api.wired) { api.wired = true; wire(); } },
  load: load,
  peek: peek,
  chip: chip,
};
window.STD_BOARD = api;
})();
