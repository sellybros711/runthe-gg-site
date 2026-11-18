/* Shut The Door: your history, a Pro perk. window.STD_HISTORY_UI.
 *
 * The owner (2026-11-18): "every daily outing and Survivor run the player has played, saved for them to
 * look back on." One screen (#s-hist), opened only from its row in the stats sheet (menus.js), which a
 * player who is not Pro sees as a plain locked row naming the perk. No price and no buy button here: the
 * store owns those.
 *
 * Built on two calls and nothing else (api.js, over supabase/182_shut_the_door_history.sql):
 *   history(before)   the kept dailies and Survivor runs, newest first, each situation's card
 *   historyOpen(ref)  one of them again, rebuilt from its calls: the scenario, the state, the result
 * Every number here is one of their fields (a daily's number, its score and pitches, a run's saves and
 * points). The only sums are counts of the rows shown.
 *
 * The house rules: a button opens it and nothing opens by itself. A row opens that outing's result (the
 * result screen, ui.js, in its history mode), where every pitch and at bat plays as a clip. Nothing is
 * stored, posted or graded again.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function API() { return window.STD_API || {}; }
function MU() { return window.STD_MODES_UI || null; }

var ctx = { onOpen: null, onBack: null, toast: null };
var H = { seq: 0, items: [], more: false, oldest: null, busy: false };

/* ---- small words ---------------------------------------------------------------------------- */

function num(n) { return n == null ? '-' : Number(n).toLocaleString('en-US'); }
/* "Tue, Nov 17" */
function dayHead(day) {
  var d = new Date(Date.parse(day + 'T12:00:00Z'));
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function chip(outcome) {
  var l = C.OUTCOME_LABEL[outcome];
  return l ? '<span class="oc ' + esc(outcome) + '">' + esc(l) + '</span>' : '';
}
/* the situation in one line: the occasion and the spot, the words the vote and Survivor use */
function where(card) {
  var m = MU();
  if (!card) return '';
  var occ = m && m.occasion ? m.occasion(card.title) : card.title || '';
  var sit = card.situation, sp = '';
  if (sit && sit.inning != null) {
    var g = sit.score ? sit.score.us - sit.score.them : null;
    sp = (sit.half === 'bottom' ? 'Bottom ' : 'Top ') + sit.inning + (g == null ? '' : g > 0 ? ', up ' + g : g < 0 ? ', down ' + -g : ', tied');
  }
  /* the spot never breaks inside itself ("up" and "1" on two lines): its spaces hold */
  return [occ, sp.replace(/ /g, '\u00a0')].filter(Boolean).join(' · ');
}
function closer(card) { return card && card.pitcher ? card.pitcher : 'The closer'; }

/* ---- the locked row, and the way in (the stats sheet, menus.js) --------------------------------- */

/* The row at the top of the stats sheet. Pro: a button to the screen. Not Pro: a plain locked row that
   names the perk, with nothing to tap. */
function rowHTML(pro) {
  var ic = '<i class="hi-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v3.8h3.8"/><path d="M12 8v4.4l3 1.8"/></svg></i>';
  if (pro) {
    return '<button type="button" class="hi-row-go" id="st-hist-go">' + ic +
      '<span class="hi-rt"><b>Your history</b><small>Every daily and Survivor run you played.</small></span><i class="chev" aria-hidden="true"></i></button>';
  }
  return '<div class="hi-row-go locked" role="note">' + ic +
    '<span class="hi-rt"><b>Your history</b><small>Every daily and Survivor run, kept to look back on.</small></span>' +
    '<span class="hi-pro"><span class="lock" aria-hidden="true"></span>PRO</span></div>';
}

/* ---- the screen ------------------------------------------------------------------------------- */

function show() {
  var my = ++H.seq;
  H.items = []; H.more = false; H.oldest = null;
  $('hi-sum').innerHTML = '';
  $('hi-list').innerHTML = '<div class="bd-empty"><img class="load-mark" src="brand/mark.svg?v=2" alt="" width="56" height="56"><p>Loading your history.</p></div>';
  return page(my, null);
}
function page(my, before) {
  if (typeof API().history !== 'function') { drawFail(); return Promise.resolve(null); }
  H.busy = true;
  return Promise.resolve().then(function () { return API().history(before); }).then(function (h) {
    H.busy = false;
    if (my !== H.seq) return h;
    if (!h || h.offline) { if (!H.items.length) drawFail(); else drawList(true); return h; }
    if (!h.pro) { drawLocked(); return h; }
    H.items = H.items.concat(h.items || []);
    H.more = !!h.more; H.oldest = h.oldest;
    drawList(false);
    return h;
  }, function () { H.busy = false; if (my === H.seq) drawFail(); return null; });
}
function drawSum() {
  var d = H.items.filter(function (x) { return x.kind === 'daily'; }).length;
  var r = H.items.filter(function (x) { return x.kind === 'survivor'; }).length;
  $('hi-sum').innerHTML = H.items.length
    ? '<div class="hi-tally"><span><b>' + num(d) + '</b>' + (d === 1 ? 'daily' : 'dailies') + '</span><span><b>' + num(r) + '</b>' + (r === 1 ? 'Survivor run' : 'Survivor runs') + '</span></div>'
    : '';
}
function dailyHTML(x) {
  return '<li><button type="button" class="hi-it" data-day="' + esc(x.day) + '">' +
    '<span class="hi-tg"><span class="hi-kind">DAILY #' + esc(x.number) + '</span>' + chip(x.outcome) + '</span>' +
    '<span class="hi-tx"><b class="hi-nm">' + esc(closer(x.card)) + '</b><span class="hi-wh">' + esc(where(x.card)) + '</span></span>' +
    '<span class="hi-sc"><b>' + num(x.score) + '</b><small>' + esc(x.pitches) + (x.pitches === 1 ? ' pitch' : ' pitches') + '</small></span>' +
    '<i class="chev" aria-hidden="true"></i></button></li>';
}
function runHTML(x) {
  var spots = (x.spots || []).map(function (s) {
    return '<li><button type="button" class="hi-it hi-spot" data-day="' + esc(x.day) + '" data-run="' + esc(x.run) + '" data-index="' + esc(s.index) + '">' +
      '<span class="hi-n" aria-hidden="true">' + esc(s.index + 1) + '</span>' +
      '<span class="hi-tx"><b class="hi-nm">' + esc(closer(s.card)) + '</b><span class="hi-wh">' + esc(where(s.card)) + '</span></span>' +
      '<span class="hi-sc"><b>' + num(s.score) + '</b>' + chip(s.outcome) + '</span>' +
      '<i class="chev" aria-hidden="true"></i></button></li>';
  }).join('');
  var state = x.over ? 'Run over.' : 'Still live.';
  return '<li class="hi-run"><div class="hi-rh"><span class="hi-tg"><span class="hi-kind surv">SURVIVOR</span>' +
    (x.run > 0 ? '<span class="hi-rn">Run ' + esc(x.run + 1) + '</span>' : '') + '</span>' +
    '<span class="hi-rs"><b>' + num(x.saves) + '</b>' + (x.saves === 1 ? 'save' : 'saves') + '<b>' + num(x.points) + '</b>points</span></div>' +
    (spots ? '<ol class="hi-spots">' + spots + '</ol>' : '') +
    '<p class="hi-st">' + (spots ? state : 'No spots played yet.') + '</p></li>';
}
function drawList(failedMore) {
  drawSum();
  var el = $('hi-list');
  if (!H.items.length) {
    el.innerHTML = '<div class="bd-empty"><img src="brand/mark.svg?v=2" alt="" width="56" height="56"><b>Nothing kept yet</b>' +
      '<p>Play today\'s daily or a Survivor run. It shows up here.</p></div>';
    return;
  }
  var days = [], by = {};
  H.items.forEach(function (x) { if (!by[x.day]) { by[x.day] = []; days.push(x.day); } by[x.day].push(x); });
  el.innerHTML = '<div class="bd-lh"><b>Newest first</b></div>' +
    days.map(function (d) {
      return '<section class="hi-day"><h3 class="hi-dh">' + esc(dayHead(d)) + '</h3><ul class="hi-items">' +
        by[d].map(function (x) { return x.kind === 'survivor' ? runHTML(x) : dailyHTML(x); }).join('') + '</ul></section>';
    }).join('') +
    (H.more ? '<button type="button" class="btn hi-more" id="hi-more">Older outings</button>' : '') +
    (failedMore ? '<p class="quiet hi-err">The older ones didn\'t load. Try again.</p>' : '');
  var mb = $('hi-more');
  if (mb) mb.addEventListener('click', function () {
    if (H.busy) return;
    mb.disabled = true; mb.textContent = 'Loading';
    page(H.seq, H.oldest);
  });
}
function drawFail() {
  $('hi-sum').innerHTML = '';
  $('hi-list').innerHTML = '<div class="bd-empty"><b>Your history didn\'t load</b><p>Nothing is lost. Try again.</p>' +
    '<button type="button" class="btn" id="hi-retry">Try again</button></div>';
  $('hi-retry').addEventListener('click', show);
}
function drawLocked() {
  $('hi-sum').innerHTML = '';
  $('hi-list').innerHTML = '<div class="bd-empty"><span class="lock" aria-hidden="true"></span><b>Your history is a Pro perk</b>' +
    '<p>Every daily and Survivor run, kept to look back on.</p></div>';
}

/* a row's tap: that outing again, on the result screen */
function open(btn) {
  if (btn.getAttribute('aria-busy') === 'true') return;
  var ref = btn.hasAttribute('data-run')
    ? { kind: 'survivor', day: btn.getAttribute('data-day'), run: +btn.getAttribute('data-run'), index: +btn.getAttribute('data-index') }
    : { kind: 'daily', day: btn.getAttribute('data-day') };
  if (typeof API().historyOpen !== 'function') return;
  btn.setAttribute('aria-busy', 'true');
  Promise.resolve().then(function () { return API().historyOpen(ref); }).then(function (v) {
    btn.removeAttribute('aria-busy');
    if (ctx.onOpen) ctx.onOpen(v);
  }, function (e) {
    btn.removeAttribute('aria-busy');
    var gone = e && /does not replay|not the run/.test(e.message || '');
    if (ctx.toast) ctx.toast(gone ? 'That outing can\'t be shown.' : 'That outing didn\'t load. Try again.');
    if (window.console) console.warn(e);
  });
}

function wire() {
  $('hi-back').addEventListener('click', function () { H.seq++; if (ctx.onBack) ctx.onBack(); });
  $('hi-list').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.hi-it');
    if (b) open(b);
  });
}

var api = {
  API_VERSION: 1,
  init: function (c) { for (var k in c) ctx[k] = c[k]; if (!api.wired && $('s-hist')) { api.wired = true; wire(); } },
  rowHTML: rowHTML,
  show: show,
};
window.STD_HISTORY_UI = api;
})();
