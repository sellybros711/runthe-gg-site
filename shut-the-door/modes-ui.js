/* Shut The Door: the screens for the modes around the daily. window.STD_MODES_UI.
 *
 * Built against the calls in CONTRACT.md sections 9, 16 and 17 and nothing else:
 *   the save    STD_API.pending() and claim(): a finished daily played signed out
 *   the vote    STD_API.vote(day) and castVote(id): tomorrow's two candidates
 *   Survivor    survivorState(), survivorStart() (ui.js plays it), survivorBoard()
 *   the archive entitlements(): the list shows only when it says archive (false for everyone now)
 * Every number here is one of those fields (a vote count, a save count, points, a rank) or the clock
 * (when the next Survivor run opens). Nothing is worked out.
 *
 * The house rules: every piece is a button or a block on a screen the player opened. Nothing opens
 * by itself, there is no modal to read, and nothing here is on the mound between pitches. The one
 * moment between two Survivor spots (#s-next) is a count and a name, never a grade.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
/* the row's plate (plate.js): the club key and initials the server answers, the neutral plate without */
function plateOf(r) {
  var PL = window.STD_PLATE;
  return PL ? PL.svg(r.plate || null, PL.initials(r.username === 'Closer' ? '' : r.username, r.initials), { cls: 'bp' }) : '';
}
function API() { return window.STD_API || {}; }
function has(n) { return typeof API()[n] === 'function'; }
function authState() {
  var A = window.STD_AUTH, st = {};
  try { st = (A && A.state && A.state()) || {}; } catch (e) { st = {}; }
  return st;
}

var ctx = { signIn: null, onSurvivor: null, onBack: null, onVote: null };

/* ---- small words -------------------------------------------------------------------------- */

var SAVE_LABEL = 'sign in to save your score';
/* the occasion from a title: "game 2 · 2017 world series", or a regular season game's date */
function occasion(title) {
  var m = /^(.*?)\s+at\s+(.*?),\s*(.*)$/i.exec(title || '');
  if (m) return m[3];
  return String(title || '').split(/,\s*/).join(' · ');
}
/* the spot, short: "top 9, up 1" */
function spot(sit) {
  if (!sit || sit.inning == null) return '';
  var m = sit.score ? sit.score.us - sit.score.them : null;
  return (sit.half === 'bottom' ? 'Bottom ' : 'Top ') + sit.inning + (m == null ? '' : m > 0 ? ', up ' + m : m < 0 ? ', down ' + -m : ', tied');
}
/* one candidate in one line: the closer, then the occasion (it carries the year) and the spot, and
   the card's setup (data/setups.json: the moment, never how it ended) */
function cardLine(c) {
  return { name: c.pitcher || '', meta: [occasion(c.title), spot(c.situation)].filter(Boolean).join(' · '), setup: c.setup || '' };
}
function chip(outcome) {
  var label = C.OUTCOME_LABEL[outcome];
  return label ? '<span class="oc ' + esc(outcome) + '">' + esc(label.toLowerCase()) + '</span>' : '';
}
function cap(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
function num(n) { return n == null ? '-' : Number(n).toLocaleString('en-US'); }

/* how long until the next Eastern day, when the next free Survivor run opens: "7h 12m" */
function untilTomorrow(now) {
  var parts = {};
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(now || new Date()).forEach(function (p) { parts[p.type] = +p.value; });
  } catch (e) { return null; }
  var left = 86400 - ((parts.hour % 24) * 3600 + parts.minute * 60 + parts.second);
  var h = Math.floor(left / 3600), m = Math.max(1, Math.ceil((left % 3600) / 60));
  if (m === 60) { h++; m = 0; }
  return h ? h + 'h ' + m + 'm' : m + 'm';
}

/* ---- 1. sign in to save your score ----------------------------------------------------------
   A daily finished signed out is kept on the device (pending()). A button on the result, and the
   same one on the board. Signing in posts it once (api.js claim() runs on the sign-in and fires
   'std-claimed'); the block then says where it landed. */
function saveBlock(el, opts) {
  if (!el) return false;
  opts = opts || {};
  var acct = opts.account, st = authState();
  var p = has('pending') ? API().pending() : null;
  if (acct && opts.justSaved) {
    el.hidden = false;
    el.className = 'r-save saved';
    el.innerHTML = '<p><b>saved.</b> ' + (acct.taken === false ? 'your account already had today. that one counts.'
      : acct.rank != null ? '#' + esc(acct.rank) + ' of ' + esc(acct.players) + ' on today\'s leaderboard.' : 'it\'s on today\'s leaderboard.') + '</p>';
    return true;
  }
  if (st.signedIn || !p) { el.hidden = true; el.innerHTML = ''; return false; }
  el.hidden = false;
  el.className = 'r-save';
  el.innerHTML = '<p><b>you\'re playing as a guest.</b> sign in to save your score to the leaderboard.</p>' +
    '<button class="btn save-b" type="button" data-save>' + SAVE_LABEL + '</button>';
  el.querySelector('[data-save]').addEventListener('click', function () { if (ctx.signIn) ctx.signIn(); });
  return true;
}

/* ---- 2. the vote for tomorrow ---------------------------------------------------------------
   From VOTE.EPOCH on. Before it vote() has no candidates and the block stays hidden. A signed-in
   player picks one of two, played today or not (164); then the block says the vote is in and shows
   the count. Signed out: the two, and the same sign-in button. The result and the home each carry
   one; each block keeps its own request count, so one never drops the other's answer. opts.quiet
   (the home's) leaves ctx.onVote, the result menu's row, alone. */
function voteBlock(el, opts) {
  if (!el || !has('vote')) { if (el) el.hidden = true; return Promise.resolve(null); }
  opts = opts || {};
  var my = el.stdVoteSeq = (el.stdVoteSeq || 0) + 1;
  return Promise.resolve().then(function () { return API().vote(); }).then(function (v) {
    if (my !== el.stdVoteSeq) return v;
    drawVote(el, v, false, opts);
    return v;
  }, function () { if (my === el.stdVoteSeq) { el.hidden = true; if (ctx.onVote && !opts.quiet) ctx.onVote(null); } return null; });
}
function drawVote(el, v, busy, opts) {
  opts = opts || {};
  if (ctx.onVote && !opts.quiet) ctx.onVote(v);
  if (!v || !v.candidates || v.candidates.length !== 2) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  var st = authState(), mine = v.myVote, tot = v.votes ? (v.votes.a || 0) + (v.votes.b || 0) : 0;
  var opts = v.candidates.map(function (c, i) {
    var L = cardLine(c), n = v.votes ? (i ? v.votes.b : v.votes.a) : null, on = mine === c.id;
    var share = tot && n != null ? Math.round(n / tot * 100) : 0;
    return '<button class="vt-o' + (on ? ' on' : '') + (mine ? ' done' : '') + '" type="button" data-id="' + esc(c.id) + '"' +
      (v.canVote && !busy ? '' : ' disabled') + ' aria-pressed="' + on + '">' +
      (v.votes ? '<i class="vt-bar" style="width:' + share + '%" aria-hidden="true"></i>' : '') +
      '<span class="vt-t"><b>' + esc(L.name) + (on ? '<em class="vt-me">your vote</em>' : '') + '</b><span>' + esc(L.meta) + '</span>' +
      (L.setup ? '<span class="vt-s">' + esc(L.setup) + '</span>' : '') + '</span>' +
      (n != null ? '<span class="vt-n"><b>' + esc(n) + '</b>' + (n === 1 ? 'vote' : 'votes') + '</span>' : '') +
      '</button>';
  }).join('');
  var foot;
  if (v.error) foot = '<p class="vt-say err">' + esc(v.error) + '.</p>';
  else if (mine) foot = '<p class="vt-say ok"><b>Your vote is in. It counts.</b> It locks at midnight Eastern.</p>';
  else if (v.canVote) foot = '<p class="vt-say">One vote. Pick the spot you want tomorrow.</p>';
  else if (!st.signedIn) foot = '<div class="vt-in"><p>Sign in to vote.</p><button class="btn save-b" type="button" data-save>' +
    (has('pending') && API().pending() ? SAVE_LABEL : 'Sign in to vote') + '</button></div>';
  else if (v.offline) foot = '<p class="vt-say">The vote didn\'t load. Try again later.</p>';
  else foot = '<p class="vt-say">' + esc(cap(v.why || 'voting is closed')) + '.</p>';
  el.innerHTML = '<div class="r-sec-h"><h3>Tomorrow\'s situation</h3><span>' + (mine ? 'The count so far' : 'You pick') + '</span></div>' +
    '<div class="vt-opts">' + opts + '</div>' + foot;
  el.querySelectorAll('.vt-o:not([disabled])').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-id');
      drawVote(el, v, true, opts);
      var my = el.stdVoteSeq = (el.stdVoteSeq || 0) + 1;
      Promise.resolve().then(function () { return API().castVote(id); }).then(function (nv) {
        if (my === el.stdVoteSeq) drawVote(el, nv, false, opts);
      }, function () { if (my === el.stdVoteSeq) drawVote(el, Object.assign({}, v, { error: 'that vote didn\'t go. try again' }), false, opts); });
    });
  });
  var s = el.querySelector('[data-save]');
  if (s) s.addEventListener('click', function () { if (ctx.signIn) ctx.signIn(); });
}

/* The home's one line on how today was picked, once the vote is on: "picked by your votes · 63-48",
   or, when the server could not say, that this is the first pick. Never the reveal. */
function pickLine(el, scn) {
  if (!el) return;
  el.hidden = true;
  if (!scn || !scn.pick) return;
  if (scn.pick === 'default') { el.hidden = false; el.textContent = 'The vote didn\'t load. First pick plays.'; return; }
  if (!has('vote')) return;
  Promise.resolve().then(function () { return API().vote(scn.day); }).then(function (v) {
    if (!v || v.winner !== scn.id) return;
    el.hidden = false;
    var w = v.votes ? (v.candidates[0] && v.candidates[0].id === v.winner ? [v.votes.a, v.votes.b] : [v.votes.b, v.votes.a]) : null;
    el.textContent = 'Picked by your votes' + (w ? ' · ' + w[0] + '-' + w[1] : '');
  }, function () {});
}

/* ---- 3. Survivor ---------------------------------------------------------------------------- */

var SV = { state: null, seq: 0 };

/* the row on the home, beside the daily: what today's run is */
function homeRow(btn) {
  if (!btn) return Promise.resolve(null);
  if (!has('survivorState')) { btn.hidden = true; return Promise.resolve(null); }
  btn.hidden = false;
  return Promise.resolve().then(function () { return API().survivorState(); }).then(function (s) {
    SV.state = s;
    var line;
    if (!s || s.run == null) line = 'save after save. one miss ends it.';
    else if (!s.over) line = 'run live · ' + s.saves + (s.saves === 1 ? ' save' : ' saves') + '. keep going.';
    else if (s.canStart) line = s.saves + (s.saves === 1 ? ' save' : ' saves') + ' today · start another';
    else { var t = untilTomorrow(); line = s.saves + (s.saves === 1 ? ' save' : ' saves') + ' today' + (t ? ' · next run in ' + t : ''); }
    btn.querySelector('.tm-s').textContent = line;
    btn.classList.toggle('live', !!(s && s.run != null && !s.over));
    return s;
  }, function () { return null; });
}

/* the Survivor screen: today's run (its state, a start button) and the Survivor board */
function showSurvivor() {
  var my = ++SV.seq;
  $('sv-eyebrow').textContent = 'today · one run a day';
  $('sv-you').innerHTML = '<p class="sv-say">loading your run.</p>';
  $('sv-list').innerHTML = '<div class="bd-empty"><img class="load-mark" src="brand/mark.svg?v=2" alt="" width="56" height="56"><p>loading the leaderboard.</p></div>';
  var stP = has('survivorState') ? Promise.resolve().then(function () { return API().survivorState(); }).catch(function () { return null; }) : Promise.resolve(null);
  stP.then(function (s) { if (my === SV.seq) { SV.state = s; drawRun(s); } });
  loadBoard(my, stP);
}
function drawRun(s) {
  var el = $('sv-you'), st = authState();
  if (!s) { el.innerHTML = '<p class="sv-say">your run didn\'t load. try again.</p>'; return; }
  if (s.pro) $('sv-eyebrow').textContent = 'today';
  var saves = s.saves || 0, html = '';
  var entries = (s.entries || []).map(function (e, i) {
    return '<li><span class="sv-i">' + (i + 1) + '</span><span class="sv-t">' + esc(occasion(e.title) || '-') + '</span>' + chip(e.outcome) + '</li>';
  }).join('');
  if (s.run == null) {
    html = '<p class="sv-say">every save sends you to the next real spot. anything but a door shut ends the run.</p>' +
      '<button class="btn take sm sv-go" type="button" id="sv-go">start the run</button>';
  } else {
    html = '<div class="bd-rank"><b>' + esc(saves) + '</b><span>' + (saves === 1 ? 'save' : 'saves') + (s.over ? '' : ' so far') + '</span></div>' +
      '<div class="bd-me"><span class="fact"><b>' + esc(num(s.points)) + '</b>points</span></div>' +
      (entries ? '<ol class="sv-run">' + entries + '</ol>' : '');
    if (!s.over) html += '<button class="btn take sm sv-go" type="button" id="sv-go">keep going · spot ' + (s.index + 1) + '</button>';
    else if (s.canStart) html += '<button class="btn take sm sv-go" type="button" id="sv-go">start another run</button>';
    else { var t = untilTomorrow(); html += '<p class="sv-next">run over. ' + (t ? 'the next one opens in <b>' + esc(t) + '</b>.' : 'the next one opens tomorrow.') + '</p>'; }
  }
  if (!st.signedIn) html += '<div class="bd-in"><p>sign in to put your run on the leaderboard.</p><button class="btn dk" type="button" id="sv-in">sign in</button></div>';
  el.innerHTML = html;
  var go = $('sv-go');
  if (go) go.addEventListener('click', function () { go.disabled = true; if (ctx.onSurvivor) ctx.onSurvivor(); });
  var si = $('sv-in');
  if (si) si.addEventListener('click', function () { if (ctx.signIn) ctx.signIn(); });
}
/* the stat line under each name (supabase/166, the run's box lines added up) shows only once you
   have finished a spot of today's run: the spots are everyone's, so before that it would spoil them */
function svPlayed() { var s = SV.state; return !!(s && s.entries && s.entries.length); }
function loadBoard(my, wait) {
  var p = has('survivorBoard') ? Promise.resolve().then(function () { return API().survivorBoard(null, 50); }).catch(function () { return null; }) : Promise.resolve(null);
  Promise.all([p, wait ? wait.catch(function () {}) : null]).then(function (got) {
    var rows = got[0], on = svPlayed();
    var B = window.STD_BOARD;
    if (my !== SV.seq) return;
    var el = $('sv-list');
    if (!Array.isArray(rows)) {
      el.innerHTML = '<div class="bd-empty"><b>the leaderboard didn\'t load</b><p>your run is safe. try again.</p><button class="btn ghost" type="button" id="sv-retry">try again</button></div>';
      $('sv-retry').addEventListener('click', function () { var m = ++SV.seq; loadBoard(m); });
      return;
    }
    if (!rows.length) {
      el.innerHTML = '<div class="bd-empty"><img src="brand/mark.svg?v=2" alt="" width="56" height="56"><b>nobody\'s on it yet</b><p>no runs posted today. be the first.</p></div>';
      return;
    }
    rows = rows.slice().sort(function (a, b) { return a.rank - b.rank; });
    var html = '', prev = 0;
    rows.forEach(function (r) {
      if (prev && r.rank > prev + 1) html += '<li class="gap" aria-hidden="true"><span>···</span></li>';
      html += '<li class="' + (r.mine ? 'mine' : '') + (r.rank <= 3 ? ' top' : '') + '"><span class="rk">' + esc(r.rank) + '</span>' +
        '<span class="nm">' + plateOf(r) + '<i class="un">' + esc(r.username) + '</i>' + (r.mine ? '<em>you</em>' : '') + (r.over ? '' : '<em class="live">live</em>') + '</span>' +
        '<span class="n sv-sv">' + esc(r.saves) + '</span><span class="n sc">' + esc(num(r.points)) + '</span>' +
        (B && B.lineHTML ? B.lineHTML(r, on) : '') + '</li>';
      prev = r.rank;
    });
    var n = rows[0].players;
    el.innerHTML = '<div class="bd-lh"><b>survivor leaderboard</b><span class="bd-n">' + esc(n) + ' ' + (n === 1 ? 'closer' : 'closers') + ' today</span></div>' +
      '<div class="bd-cols-h sv-cols" aria-hidden="true"><span>#</span><span>closer</span><span>saves</span><span>pts</span></div>' +
      '<ol class="bd-rows sv-rows">' + html + '</ol>';
  });
}

/* Between two spots: "saves: 3. next: Kenley Jansen, 2017". A count and a name, no grade. It goes
   on by itself after NEXT_MS (the owner: each save moves straight on), and a tap goes sooner. */
var NEXT_MS = 1900;
function between(saves, scn, quick) {
  var p = scn && scn.pitcher || {};
  $('nx-saves').textContent = 'saves: ' + saves;
  $('nx-next').innerHTML = '<span>next:</span> <b>' + esc(p.name || '') + (p.year ? ', ' + esc(p.year) : '') + '</b>';
  $('nx-occ').textContent = [occasion(scn && scn.title), spot(scn && scn.situation)].filter(Boolean).join(' · ');
  var sec = $('s-next');
  return new Promise(function (res) {
    var done = false, t;
    var go = function () { if (done) return; done = true; clearTimeout(t); sec.removeEventListener('click', go); document.removeEventListener('keydown', key); res(); };
    var key = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    sec.addEventListener('click', go);
    document.addEventListener('keydown', key);
    t = setTimeout(go, quick ? NEXT_MS / 1.6 : NEXT_MS);
  });
}

/* ---- 4. the archive (Pro). Built, and shown only when entitlements() says archive. ---------- */
var ENT = null;
function entitlements() {
  if (!has('entitlements')) return Promise.resolve(null);
  return Promise.resolve().then(function () { return API().entitlements(); }).then(function (e) { ENT = e; return e; }, function () { return null; });
}
/* every daily from #1 to yesterday, newest first: [{day, number}] */
function archiveDays(today) {
  var out = [], d = today;
  for (var i = 0; i < 400; i++) {
    d = new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
    if (d < C.EPOCH) break;
    out.push({ day: d, number: C.dayNumberOf(d) });
  }
  return out;
}

function wire() {
  /* Survivor lives on the home's tab now (ui.js setTab): no screen of its own, so no back button */
  var bk = $('sv-back');
  if (bk) bk.addEventListener('click', function () { SV.seq++; if (ctx.onBack) ctx.onBack(); });
}

var api = {
  API_VERSION: 1,
  init: function (c) { for (var k in c) ctx[k] = c[k]; if (!api.wired) { api.wired = true; wire(); } },
  SAVE_LABEL: SAVE_LABEL,
  saveBlock: saveBlock, voteBlock: voteBlock, pickLine: pickLine,
  homeRow: homeRow, showSurvivor: showSurvivor, between: between, untilTomorrow: untilTomorrow,
  entitlements: entitlements, ent: function () { return ENT; }, archiveDays: archiveDays,
  cardLine: cardLine, occasion: occasion,
};
window.STD_MODES_UI = api;
})();
