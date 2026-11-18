/* Shut The Door: custom challenges, the screens. window.STD_CHALLENGE_UI.
 *
 * The owner (2026-11-18): a Pro player builds a challenge (any pitcher against any lineup, who is up,
 * who is on, the outs, the count, the lead, the inning) and gets a link to share. Anyone with the link
 * plays it free. Posting a score needs a sign-in, one counted try a player, and practice never posts.
 * The result compares you with them and lists everyone who played it, with the best-play hold%. No
 * percentile, and never on the daily or Survivor boards.
 *
 * Four pieces, all reached from a button or the link itself, nothing opened by itself:
 *   1. the builder (#s-chal): Pro only. Anyone else sees a locked entry that names the perk, with the
 *      store's Get Pro block (pro.js offer). From the home's menu row and the archive tab's card.
 *   2. the intro (#s-cint): the page opened with ?c=CODE, or a row of My challenges. Who made it, the
 *      setup, best-play hold%, the standings, Play (counted) and Practice, a sign-in prompt to post.
 *   3. the result's challenge parts (ui.js renderResult calls these): the comparison, the standings
 *      tile, the guest's sign-in block, the share card's fields and the share text with the link.
 *   4. My challenges (inside #s-chal): made and played, newest first.
 *
 * Every number here is a field of the calls (api.js, CONTRACT.md 18): previewChallenge's bestHold and
 * setup line, getChallenge's standings and players, the result's score. Every refusal is shown as the
 * API words it. The setup line is challenge.js setupOf, never written here.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function API() { return window.STD_API || {}; }
function has(k) { return typeof API()[k] === 'function'; }
function authed() { try { var a = window.STD_AUTH; return !!(a && a.state && a.state().signedIn); } catch (e) { return false; } }
function num(n) { return n == null ? '-' : Number(n).toLocaleString('en-US'); }
function cap(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
/* an API refusal, as it words it, set as a sentence */
function say(t) { t = cap(String(t || 'that did not work').trim()); return /[.?!]$/.test(t) ? t : t + '.'; }
function oc(outcome) { var l = C.OUTCOME_LABEL[outcome]; return l ? '<span class="oc ' + esc(outcome) + '">' + esc(l) + '</span>' : ''; }
function nick(team) {
  var c = window.STD_CLUB_NAMED ? window.STD_CLUB_NAMED(team) : null;
  if (c) return c.nick;
  var p = String(team || '').trim().split(/\s+/);
  return p[p.length - 1] || '';
}
function inn(n) { return n === 8 ? '8th' : n === 9 ? '9th' : '10th'; }
var ORD = ['first', 'second', 'third'];
var BASE_TAG = ['1B', '2B', '3B'];

/* what the page around it does (ui.js): a toast, the account sheet, the scorebug, play, go home, a screen */
var ctx = { toast: null, signIn: null, bug: null, onPlay: null, onHome: null, show: null };
function toast(t) { if (ctx.toast) ctx.toast(t); }

/* ---- the way in: the menu row and the card (index.html carries the markup) ---------------------- */

var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
/* A card any screen can drop in (the archive tab carries one). One button to the screen, for everyone:
   Pro builds there, anyone else finds the locked entry and Get Pro there. */
function cardHTML() {
  return '<section class="card ch-card" aria-labelledby="ch-card-h">' +
    '<div class="ch-ct"><i class="ch-ic" aria-hidden="true">' + ICON + '</i>' +
    '<span class="ch-ctt"><b id="ch-card-h">Custom challenges</b><small>Any closer against any lineup. You set the spot. Friends play it free.</small></span>' +
    '<span class="hi-pro">PRO</span></div>' +
    '<button type="button" class="btn ghost ch-card-go" data-chal-open>Open challenges</button></section>';
}

/* ---- 1. the builder ----------------------------------------------------------------------------- */

var B = { seq: 0, opts: null, spec: null, prev: null, made: null, pro: false, ent: null, timer: null, tab: 'new', mine: null, mineSeq: 0 };

function pitcherOf(id) { var o = B.opts; return o && o.pitchers.filter(function (p) { return p.id === id; })[0] || null; }
function lineupOf(id) { var o = B.opts; return o && o.lineups.filter(function (l) { return l.id === id; })[0] || null; }
function built(p, l) { return !!(B.opts && B.opts.pairs[p + '__' + l]); }
function pitcherWords(p) { return p ? p.name + ' · ' + p.year + ' ' + nick(p.team) : ''; }
function lineupWords(l) { return l ? l.year + ' ' + (l.team || 'lineup') : ''; }
/* how far back from the man up a hitter bats: 1 is the man just before him */
function back(i, up) { return (up - i + 9) % 9; }
function canRun(i, up) { var b = back(i, up); return b >= 1 && b <= 4; }

function freshSpec(o) {
  var p = o.pitchers[0], l = o.lineups.filter(function (x) { return built(p.id, x.id); });
  var own = l.filter(function (x) { return x.id === p.id; })[0] || l[0];
  return { v: 1, pitcher: p.id, lineup: own ? own.id : null, up: 0, on: [null, null, null], outs: 0, balls: 0, strikes: 0, lead: 1, them: 2, inning: 9, home: false };
}

/* the extra inning starts with a runner on second: the hitter before the man up, or the next one back
   who is free (MLB's rule names the man who made the last out; any of the four the API allows is legal) */
function tenth(s) {
  if (s.inning !== 10 || s.on[1] != null) return;
  for (var b = 1; b <= 4; b++) {
    var i = (s.up - b + 9) % 9;
    if (s.on.indexOf(i) < 0) { s.on[1] = i; return; }
  }
}
function setUp(i) {
  var s = B.spec;
  s.up = i;
  s.on = s.on.map(function (r) { return r == null || r === i || !canRun(r, i) ? null : r; });
  tenth(s);
}
function setBase(i, k) {
  var s = B.spec;
  if (s.on[k] === i) {
    if (s.inning === 10 && k === 1) { toast('The 10th starts with a runner on second.'); return false; }
    s.on[k] = null;
    return true;
  }
  s.on = s.on.map(function (r) { return r === i ? null : r; });
  s.on[k] = i;
  return true;
}

function seg(name, list, cur, label) {
  return '<div class="seg cb-seg" role="radiogroup" aria-label="' + esc(label) + '" data-f="' + esc(name) + '">' +
    list.map(function (x) {
      return '<button type="button" role="radio" data-v="' + esc(JSON.stringify(x[0])) + '" aria-checked="' + (x[0] === cur) + '">' + esc(x[1]) + '</button>';
    }).join('') + '</div>';
}
function field(label, inner, cls) {
  return '<div class="cb-f' + (cls ? ' ' + cls : '') + '"><span class="cb-l">' + esc(label) + '</span>' + inner + '</div>';
}

function lineupRows() {
  var s = B.spec, l = lineupOf(s.lineup);
  if (!l) return '';
  var side = B.prev && B.prev.scenario && B.prev.spec && B.prev.spec.lineup === s.lineup && B.prev.spec.pitcher === s.pitcher ? B.prev.scenario.batters : null;
  return '<ol class="cb-order">' + l.batters.slice(0, 9).map(function (b, i) {
    var up = i === s.up, run = canRun(i, s.up), base = s.on.indexOf(i);
    var bats = side && side[i] && side[i].bats ? side[i].bats : '';
    var right = up ? '<span class="cb-up">UP</span>'
      : run ? '<span class="cb-bases" role="group" aria-label="' + esc(b.name) + ' on base">' + BASE_TAG.map(function (t, k) {
          return '<button type="button" class="cb-b" data-run="' + i + '" data-base="' + k + '" aria-pressed="' + (base === k) + '" aria-label="' + esc(b.name) + ' on ' + ORD[k] + '">' + t + '</button>';
        }).join('') + '</span>'
      : '';
    return '<li class="' + (up ? 'up' : base >= 0 ? 'on' : '') + '">' +
      '<button type="button" class="cb-who" data-up="' + i + '" aria-pressed="' + up + '" aria-label="' + esc(b.name) + (up ? ', up' : ', put him up') + '">' +
      '<span class="cb-n">' + (i + 1) + '</span><span class="cb-nm">' + esc(b.name) + '</span>' + (bats ? '<em class="cb-bt">' + esc(bats) + '</em>' : '') + '</button>' +
      right + '</li>';
  }).join('') + '</ol>';
}

function builderHTML() {
  var o = B.opts, s = B.spec;
  var pOpts = o.pitchers.map(function (p) {
    return '<option value="' + esc(p.id) + '"' + (p.id === s.pitcher ? ' selected' : '') + '>' + esc(pitcherWords(p)) + '</option>';
  }).join('');
  var lOpts = o.lineups.map(function (l) {
    var ok = built(s.pitcher, l.id);
    return '<option value="' + esc(l.id) + '"' + (l.id === s.lineup ? ' selected' : '') + (ok ? '' : ' disabled') + '>' + esc(lineupWords(l)) + (ok ? '' : ' (not built yet)') + '</option>';
  }).join('');
  return '<div class="cb-picks">' +
    '<label class="cb-f"><span class="cb-l">Pitcher</span><select class="cb-sel" id="cb-pitcher">' + pOpts + '</select></label>' +
    '<label class="cb-f"><span class="cb-l">Lineup</span><select class="cb-sel" id="cb-lineup">' + lOpts + '</select></label></div>' +
    '<div class="cb-prev" id="cb-prev" aria-live="polite"></div>' +
    '<div class="cb-f cb-lu"><span class="cb-l">Who is up, who is on</span>' +
    '<p class="cb-hint">Tap a hitter to put him up. A runner is one of the four hitters before him.</p>' +
    '<div id="cb-order">' + lineupRows() + '</div></div>' +
    '<div class="cb-grid">' +
    field('Outs', seg('outs', [[0, '0'], [1, '1'], [2, '2']], s.outs, 'Outs')) +
    field('Balls', seg('balls', [[0, '0'], [1, '1'], [2, '2'], [3, '3']], s.balls, 'Balls')) +
    field('Strikes', seg('strikes', [[0, '0'], [1, '1'], [2, '2']], s.strikes, 'Strikes')) +
    field('Your lead', seg('lead', [[1, 'Up 1'], [2, 'Up 2'], [3, 'Up 3']], s.lead, 'Your lead')) +
    field('Inning', seg('inning', [[8, '8th'], [9, '9th'], [10, '10th']], s.inning, 'Inning')) +
    field('Where', seg('home', [[false, 'Road'], [true, 'Home']], s.home, 'Where')) +
    field('Their runs', '<div class="cb-step" role="group" aria-label="Their runs">' +
      '<button type="button" data-step="-1" aria-label="One fewer"' + (s.them <= 0 ? ' disabled' : '') + '>&minus;</button>' +
      '<b id="cb-them">' + esc(s.them) + '</b>' +
      '<button type="button" data-step="1" aria-label="One more"' + (s.them >= 20 ? ' disabled' : '') + '>+</button></div>') +
    '</div>' +
    '<p class="cb-note" id="cb-note">' + esc(whereNote(s)) + '</p>' +
    '<div class="cb-go"><button type="button" class="btn take cb-make" id="cb-make" disabled>Make the link</button>' +
    '<p class="au-err" id="cb-err" role="alert"></p></div>' +
    '<div id="cb-made"></div>';
}
function whereNote(s) {
  var t = s.home ? 'At home he works the top.' : 'On the road he works the bottom.';
  if (!s.home && s.inning >= 9) t += ' A walk-off is live.';
  if (s.inning === 10) t += ' The 10th starts with a runner on second.';
  return t;
}

function drawBuilder() {
  var el = $('cb-body');
  if (!el) return;
  el.innerHTML = builderHTML();
  preview(true);
}
/* after a pick: only what changed is drawn again, so the selects keep the focus */
function redrawPicks() {
  $('cb-order').innerHTML = lineupRows();
  document.querySelectorAll('#cb-body .cb-seg').forEach(function (g) {
    var f = g.getAttribute('data-f');
    g.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', String(JSON.parse(b.getAttribute('data-v')) === B.spec[f])); });
  });
  $('cb-them').textContent = B.spec.them;
  var st = document.querySelectorAll('#cb-body [data-step]');
  st[0].disabled = B.spec.them <= 0; st[1].disabled = B.spec.them >= 20;
  $('cb-note').textContent = whereNote(B.spec);
  preview(false);
}
function preview(now) {
  clearTimeout(B.timer);
  B.made = null;
  if ($('cb-made')) $('cb-made').innerHTML = '';
  if ($('cb-err')) $('cb-err').textContent = '';
  var my = ++B.seq;
  /* busy and nothing to make from the first tap, so a stale preview is never the one made */
  if ($('cb-prev')) $('cb-prev').classList.add('busy');
  if ($('cb-make')) { $('cb-make').disabled = true; $('cb-make').hidden = false; }
  var go = function () {
    var el = $('cb-prev'), mk = $('cb-make');
    if (!el) return;
    Promise.resolve().then(function () { return API().previewChallenge(JSON.parse(JSON.stringify(B.spec))); }).then(function (p) {
      if (my !== B.seq) return;
      el.classList.remove('busy');
      if (!p || p.error) { B.prev = null; el.innerHTML = '<p class="cb-why">' + esc(say(p && p.error)) + '</p>'; return; }
      var hadSide = B.prev && B.prev.spec.pitcher === p.spec.pitcher && B.prev.spec.lineup === p.spec.lineup;
      B.prev = p;
      el.innerHTML = previewHTML(p);
      if (!hadSide) $('cb-order').innerHTML = lineupRows();
      if (mk) mk.disabled = false;
    }, function (e) {
      if (my !== B.seq) return;
      el.classList.remove('busy');
      B.prev = null;
      el.innerHTML = '<p class="cb-why">' + esc(say(e && e.message ? e.message : 'that matchup did not load. try again')) + '</p>';
    });
  };
  if (now) go(); else B.timer = setTimeout(go, 140);
}
function previewHTML(p) {
  return (ctx.bug ? '<div class="cb-bug">' + ctx.bug(p.scenario) + '</div>' : '') +
    '<p class="cb-setup">' + esc(p.scenario.setup) + '</p>' +
    '<p class="cb-hold"><b>' + esc(p.bestHold) + '%</b><span>Best play holds the lead this often.</span></p>';
}

function make() {
  var mk = $('cb-make');
  if (!mk || mk.disabled) return;
  mk.disabled = true;
  mk.textContent = 'Making it';
  $('cb-err').textContent = '';
  var my = B.seq;
  Promise.resolve().then(function () { return API().createChallenge(JSON.parse(JSON.stringify(B.spec))); }).then(function (r) {
    mk.textContent = 'Make the link';
    if (my !== B.seq) return;
    if (!r || r.error) { mk.disabled = false; $('cb-err').textContent = say(r && r.error); return; }
    /* made: the button goes until the spot changes, so one tap makes one link */
    mk.hidden = true;
    B.made = r;
    B.mine = null;
    $('cb-made').innerHTML = madeHTML(r);
    var m = $('cb-made');
    try { m.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    loadMine();
  }, function () { mk.disabled = false; mk.textContent = 'Make the link'; $('cb-err').textContent = 'That did not work. Try again.'; });
}
function linkBox(url, id) {
  return '<div class="cb-link"><input type="text" readonly value="' + esc(url) + '" aria-label="The link" id="' + id + '">' +
    '<button type="button" class="btn go" data-copy="' + esc(url) + '">Copy</button></div>';
}
function madeHTML(r) {
  return '<div class="cb-done" role="status"><p class="cb-dh"><b>Your link is ready.</b> Code ' + esc(r.code) + '.</p>' +
    linkBox(r.url, 'cb-url') +
    '<div class="cb-acts"><button type="button" class="btn ghost" data-send="' + esc(r.url) + '" data-code="' + esc(r.code) + '">Send it</button>' +
    '<button type="button" class="btn ghost" data-open-code="' + esc(r.code) + '">Play it first</button></div>' +
    '<p class="quiet">Your first counted try is your score. Practice never posts.</p></div>';
}

function lockedHTML() {
  var P = window.STD_PRO;
  return '<div class="cb-lock"><span class="lock" aria-hidden="true"></span>' +
    '<b>Custom challenges are a Pro perk</b>' +
    '<p>Pick any closer and any lineup. Set who is up, who is on, the outs, the count and the lead. Send the link. Anyone plays it free.</p>' +
    (P ? P.offer('challenge') : '') + '</div>';
}

/* ---- 4. My challenges --------------------------------------------------------------------------- */

function spot(sp) {
  return (sp.home ? 'Top ' : 'Bottom ') + inn(sp.inning) + ', up ' + sp.lead + ' · ' + (sp.outs === 0 ? 'nobody out' : sp.outs === 1 ? 'one out' : 'two out');
}
function mineRow(x) {
  var p = pitcherOf(x.spec && x.spec.pitcher), l = lineupOf(x.spec && x.spec.lineup);
  var who = p ? p.name + ' vs the ' + lineupWords(l) : 'Code ' + x.code;
  return '<li><button type="button" class="hi-it ch-it" data-open-code="' + esc(x.code) + '">' +
    '<span class="hi-tg"><span class="hi-kind' + (x.made ? '' : ' surv') + '">' + (x.made ? 'YOU MADE IT' : 'PLAYED') + '</span><span class="ch-code">' + esc(x.code) + '</span></span>' +
    '<span class="hi-tx"><b class="hi-nm">' + esc(who) + '</b><span class="hi-wh">' + esc(x.spec ? spot(x.spec) : '') + ' · ' + esc(num(x.players)) + ' played</span></span>' +
    '<span class="hi-sc"><b>' + num(x.myScore) + '</b><small>' + (x.myScore == null ? 'not played' : 'your score') + '</small></span>' +
    '<i class="chev" aria-hidden="true"></i></button></li>';
}
function loadMine() {
  var el = $('cb-mine');
  if (!el) return;
  var my = ++B.mineSeq;
  if (!authed()) {
    el.innerHTML = '<div class="bd-lh"><b>My challenges</b></div><div class="bd-empty"><b>Sign in to see yours</b><p>The ones you made and the ones you played.</p>' +
      '<button type="button" class="btn save-b" data-sign>Sign in</button></div>';
    return;
  }
  el.innerHTML = '<div class="bd-lh"><b>My challenges</b></div><p class="quiet ch-wait">Loading.</p>';
  Promise.resolve().then(function () { return has('myChallenges') ? API().myChallenges() : null; }).then(function (l) {
    if (my !== B.mineSeq) return;
    if (!Array.isArray(l)) { el.innerHTML = '<div class="bd-lh"><b>My challenges</b></div><p class="quiet ch-wait">Your challenges did not load. Try again later.</p>'; return; }
    if (!l.length) {
      el.innerHTML = '<div class="bd-lh"><b>My challenges</b></div><div class="bd-empty"><b>None yet</b><p>' +
        (B.pro ? 'Make one and it shows up here. So does a friend\'s once you play it.' : 'Open a link a friend sends you. It shows up here once you play it.') + '</p></div>';
      return;
    }
    el.innerHTML = '<div class="bd-lh"><b>My challenges</b><span>Newest first</span></div><ul class="hi-items">' + l.map(mineRow).join('') + '</ul>';
  }, function () { if (my === B.mineSeq) el.innerHTML = '<div class="bd-lh"><b>My challenges</b></div><p class="quiet ch-wait">Your challenges did not load. Try again later.</p>'; });
}

function setTab(t) {
  B.tab = t;
  document.querySelectorAll('#cb-tabs [data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === t)); });
  var s = $('s-chal');
  if (s) s.setAttribute('data-tab', t);
}

/* The screen: Pro builds, anyone else sees the locked entry. My challenges under it for everyone. */
function openBuilder() {
  if (ctx.show) ctx.show('s-chal');
  setTab(B.tab || 'new');
  var el = $('cb-body');
  el.innerHTML = '<div class="bd-empty"><img class="load-mark" src="brand/mark.svg?v=2" alt="" width="56" height="56"><p>Loading the closers.</p></div>';
  var my = ++B.seq;
  var ent = has('entitlements') ? API().entitlements() : Promise.resolve({});
  return Promise.resolve(ent).then(function (e) {
    B.ent = e || {};
    B.pro = !!(e && e.pro);
    if (my !== B.seq) return;
    $('cb-eyebrow').textContent = B.pro ? 'Pro · your challenges' : 'Pro · custom challenges';
    if (!B.pro) { el.innerHTML = lockedHTML(); loadMine(); if (!B.opts && has('challengeOptions')) API().challengeOptions().then(function (o) { B.opts = o; }, function () {}); return; }
    return API().challengeOptions().then(function (o) {
      if (my !== B.seq) return;
      B.opts = o;
      if (!B.spec || !pitcherOf(B.spec.pitcher)) B.spec = freshSpec(o);
      drawBuilder();
      loadMine();
    });
  }).catch(function (e) {
    if (my !== B.seq) return;
    el.innerHTML = '<div class="bd-empty"><b>The builder did not load</b><p>Nothing is lost. Try again.</p><button type="button" class="btn" id="cb-retry">Try again</button></div>';
    $('cb-retry').addEventListener('click', openBuilder);
    if (window.console) console.warn(e);
  });
}

/* ---- 2. the intro: a challenge by its code -------------------------------------------------------- */

var V = { code: null, view: null, seq: 0, busy: false };

function opponent(results, mine) {
  results = results || [];
  var maker = results.filter(function (x) { return x.creator && !x.mine; })[0];
  if (maker && !mine) return maker;
  return results.filter(function (x) { return !x.mine; })[0] || null;
}
function standingsHTML(results, players, max) {
  results = results || [];
  if (!results.length) return '<div class="bd-lh"><b>Standings</b></div><p class="quiet ch-none">Nobody has posted a score yet. Be the first.</p>';
  var rows = results.slice(0, max || 50), me = results.filter(function (x) { return x.mine; })[0];
  if (me && rows.indexOf(me) < 0) rows = rows.concat([me]);
  return '<div class="bd-lh"><b>Standings</b><span>' + esc(num(players != null ? players : results.length)) + ' played</span></div>' +
    '<ol class="bd-rows ch-rows">' + rows.map(function (x, i) {
      var rk = x.rank != null ? x.rank : i + 1;
      var tag = x.mine ? '<em>you</em>' : x.creator ? '<em class="mk">maker</em>' : '';
      return '<li class="' + (x.mine ? 'mine' : '') + (rk <= 3 ? ' top' : '') + '"><span class="rk">' + esc(rk) + '</span>' +
        '<span class="nm"><i class="un">' + esc(x.username || 'a closer') + '</i>' + tag + '</span>' +
        oc(x.outcome) + '<span class="n sc">' + esc(num(x.score)) + '</span></li>';
    }).join('') + '</ol>';
}
function heldHTML(v) {
  return '<p class="cb-hold ci-hold"><b>' + esc(v.bestHold) + '%</b><span>Best play holds the lead this often.</span></p>';
}

function introHTML(v) {
  var sc = v.scenario, m = sc.matchup || {}, p = sc.pitcher || {};
  var played = v.played || null, mineRes = v.myResult || null;
  var postedScore = mineRes ? mineRes.score : played && played.submitted ? played.score : null;
  var head = v.mine ? 'Your challenge' : (v.creator || 'A closer') + ' challenges you';
  var them = opponent(v.results, v.mine);
  var facts = '<div class="ci-facts">' +
    '<span><b>' + esc(v.bestHold) + '%</b>best play holds</span>' +
    '<span><b>' + esc(num(v.players || 0)) + '</b>played</span>' +
    (them ? '<span><b>' + esc(num(them.score)) + '</b>' + esc(them.creator ? 'theirs' : 'top score') + '</span>' : '') + '</div>';
  var go;
  if (postedScore != null) {
    go = '<p class="ci-said"><b>Your try counts: ' + esc(num(postedScore)) + '.</b> One counted try a player.</p>' +
      '<div class="ci-btns"><button type="button" class="btn take ci-play" data-ci="see">See your result</button>' +
      '<button type="button" class="btn dk" data-ci="practice">Practice</button></div>';
  } else if (played && played.score != null) {
    go = '<p class="ci-said"><b>You played it as a guest: ' + esc(num(played.score)) + '.</b> Sign in to post it.</p>' +
      '<div class="ci-btns"><button type="button" class="btn take ci-play" data-ci="see">See your result</button>' +
      '<button type="button" class="btn dk" data-ci="practice">Practice</button></div>';
  } else {
    go = '<div class="ci-btns"><button type="button" class="btn take ci-play" data-ci="play">Play it</button>' +
      '<button type="button" class="btn dk" data-ci="practice">Practice</button></div>' +
      '<p class="ci-said">Your first try counts. Practice never posts.</p>';
  }
  var guest = !authed() && postedScore == null
    ? '<div class="r-save ci-save"><p><b>Playing as a guest.</b> Sign in to post your score.</p><button class="btn save-b" type="button" data-sign>Sign in to post</button></div>' : '';
  return {
    hero: '<p class="eyebrow">Challenge · ' + esc(v.code) + '</p>' +
      '<h2 class="ci-head">' + esc(head) + '</h2>' +
      '<div class="seam" aria-hidden="true"></div>' +
      '<p class="ci-vs"><b>' + esc(p.name || '') + '</b><span>' + esc(p.year + ' ' + nick(p.team)) + ' vs the ' + esc((m.lineupYear || '') + ' ' + (m.lineupTeam || '')) + '</span></p>' +
      (ctx.bug ? '<div class="cb-bug ci-bug">' + ctx.bug(sc) + '</div>' : '') +
      '<p class="ci-setup">' + esc(sc.setup) + '</p>' + facts + guest + go,
    list: standingsHTML(v.results, v.players, 20) +
      '<div class="ci-share"><p class="cb-l">Send it on</p>' + linkBox(v.url, 'ci-url') +
      '<button type="button" class="btn ghost ci-send" data-send="' + esc(v.url) + '" data-code="' + esc(v.code) + '">Send it</button></div>',
  };
}
function drawIntro(v) {
  var h = introHTML(v);
  $('ci-hero').innerHTML = h.hero;
  $('ci-list').innerHTML = h.list;
  var tc = v.scenario.pitcher && v.scenario.pitcher.teamColors;
  $('s-cint').style.setProperty('--club', tc && tc[0] ? tc[0] : '');
}
function loading(t) {
  $('ci-hero').innerHTML = '<p class="eyebrow">Challenge</p><div class="bd-empty ci-load"><img class="load-mark" src="brand/mark.svg?v=2" alt="" width="56" height="56"><p>' + esc(t) + '</p></div>';
  $('ci-list').innerHTML = '';
}
function openCode(code) {
  var c = String(code || '').trim().toUpperCase();
  V.code = c;
  if (ctx.show) ctx.show('s-cint');
  loading('Loading the challenge.');
  return reload();
}
function reload() {
  var my = ++V.seq, c = V.code;
  return Promise.resolve().then(function () { return API().getChallenge(c); }).then(function (v) {
    if (my !== V.seq) return v;
    if (!v || v.error) {
      V.view = null;
      var none = v && /no such|not a challenge/.test(v.error || '');
      $('ci-hero').innerHTML = '<p class="eyebrow">Challenge · ' + esc(c) + '</p><div class="bd-empty ci-load"><b>' + (none ? 'No challenge with that code' : 'The challenge did not load') + '</b><p>' +
        esc(none ? 'Check the link. The code is six letters and numbers.' : say(v && v.error)) + '</p>' +
        (none ? '' : '<button type="button" class="btn" data-ci="retry">Try again</button>') + '</div>';
      $('ci-list').innerHTML = '';
      return v;
    }
    V.view = v;
    drawIntro(v);
    return v;
  }, function (e) {
    if (my !== V.seq) return null;
    $('ci-hero').innerHTML = '<p class="eyebrow">Challenge · ' + esc(c) + '</p><div class="bd-empty ci-load"><b>The challenge did not load</b><p>' + esc(say(e && e.message)) + '</p><button type="button" class="btn" data-ci="retry">Try again</button></div>';
    return null;
  });
}
function play(practice) {
  if (!V.view || V.busy) return;
  V.busy = true;
  var v = V.view;
  Promise.resolve().then(function () { return API().startChallenge(v.code, { practice: !!practice }); }).then(function (st) {
    V.busy = false;
    if (ctx.onPlay) ctx.onPlay(v, st);
  }, function (e) {
    V.busy = false;
    toast(say(e && e.message ? e.message : 'that did not start. try again'));
    if (window.console) console.warn(e);
  });
}

/* ---- 3. the result's parts (ui.js renderResult) ------------------------------------------------- */

/* the comparison, for the rail's bar: {tone, html}. tone is the bar's colour: beat, matched or lost */
function versus(r) {
  var ch = r.challenge || {}, v = V.view;
  var mine = v ? v.mine : false;
  var them = ch.practice ? null : opponent(ch.results || (v && v.results), mine);
  var you = r.score;
  /* the eyebrow above already says challenge and its code: the bar says who it is against */
  var kick = ch.practice ? 'Practice · not posted' : them ? (them.creator ? 'Against the maker' : 'Against the top score') : 'Your score';
  if (!them) {
    return { tone: 'matched', html: '<div class="vs-t"><small>' + esc(kick) + '</small>' +
      '<div class="cv"><span class="cv-s you"><i>You</i><b>' + esc(num(you)) + '</b></span></div>' +
      '<span class="vs-l">' + esc(ch.practice ? 'Practice never posts. Your counted try is the one on the board.' : 'Nobody else has played it yet. Send the link.') + '</span></div>' };
  }
  var d = you - them.score, tone = d > 0 ? 'beat' : d === 0 ? 'matched' : 'lost';
  var line = d > 0 ? 'You beat ' + them.username + ' by ' + num(d) + '.' : d === 0 ? 'Dead even with ' + them.username + '.' : them.username + ' is ahead by ' + num(-d) + '.';
  return { tone: tone, them: them, html: '<div class="vs-t"><small>' + esc(kick) + '</small>' +
    '<div class="cv"><span class="cv-s you' + (d >= 0 ? ' win' : '') + '"><i>You</i><b>' + esc(num(you)) + '</b></span>' +
    '<span class="cv-dot" aria-hidden="true">·</span>' +
    '<span class="cv-s them' + (d <= 0 ? ' win' : '') + '"><i>' + esc(them.username) + '</i><b>' + esc(num(them.score)) + '</b></span></div>' +
    '<span class="vs-l">' + esc(line) + '</span></div>' };
}
/* the standings tile in the result's main column */
function tileHTML(r) {
  var ch = r.challenge || {}, v = V.view;
  var res = ch.results || (v && v.results) || [];
  var note = ch.practice ? 'Practice. Your score was not posted.'
    : ch.taken === false ? 'Your first try is the one that counts. This one was not posted.'
    : !authed() ? 'You played as a guest. Sign in to post your score.' : '';
  return '<div class="r-sec-h"><h3>The challenge</h3><span>' + esc(ch.code || '') + '</span></div>' +
    (v ? heldHTML(v) : '') +
    (note ? '<p class="quiet ch-note">' + esc(note) + '</p>' : '') +
    standingsHTML(res, ch.players != null ? ch.players : v && v.players, 50) +
    (ch.url ? '<div class="ci-share"><p class="cb-l">Send it on</p>' + linkBox(ch.url, 'rc-url') + '</div>' : '');
}
/* a guest's counted try: one sign-in posts it (ui.js runs claimChallenge on the sign-in) */
function saveBlock(el, r) {
  var ch = r && r.challenge;
  if (!el) return;
  if (!ch || ch.practice || authed()) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.className = 'r-save';
  el.innerHTML = '<p><b>You played as a guest.</b> Sign in to post your score to the challenge.</p>' +
    '<button class="btn save-b" type="button" data-sign>Sign in to post</button>';
}
/* the share text: the outcome and score, the matchup, the strip, the https link */
function shareText(r, scn) {
  var ch = r.challenge || {};
  var lines = [C.SHARE_TITLE + ' challenge'];
  lines.push(String(C.OUTCOME_LABEL[r.outcome] || '').toLowerCase() + ' · ' + num(r.score));
  if (scn && scn.title) lines.push(scn.title);
  var sq = (r.strip || []).map(function (b) { return C.SQUARE[b] || ''; });
  for (var i = 0; i < sq.length; i += C.SQUARES_PER_LINE) lines.push(sq.slice(i, i + C.SQUARES_PER_LINE).join(''));
  lines.push('Beat it: ' + (ch.url || C.SHARE_LINK));
  return lines.join('\n');
}
/* the share card's fields (card.js): the score in the percentile's place, the comparison as the
   verdict, the link in the footer */
function cardFields(r) {
  var ch = r.challenge || {}, vs = versus(r), them = vs.them;
  var link = ch.url ? ch.url.replace(/^https?:\/\//, '') : null;
  return {
    label: 'challenge', percentile: null, score: r.score, link: link,
    vsReal: them ? vs.tone : null,
    vsLabel: them ? 'you vs ' + them.username : null,
    vsHead: them ? 'You ' + num(r.score) + ' · ' + them.username + ' ' + num(them.score) : null,
    vsWhy: them ? 'Your turn. The link is below.' : null,
  };
}

/* ---- wiring --------------------------------------------------------------------------------------- */

function copy(text) {
  var done = function () { toast('Link copied.'); };
  var fall = function () {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
    } catch (e) { toast('Could not copy.'); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fall); else fall();
}
function send(url, code) {
  var touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  var text = 'Beat my score on Shut The Door. Code ' + code + '.';
  if (navigator.share && touch) { navigator.share({ text: text, url: url }).then(function () {}, function () {}); return; }
  copy(url);
}

function wire() {
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var o = t.closest('[data-chal-open]');
    if (o) { openBuilder(); return; }
    var cp = t.closest('[data-copy]');
    if (cp) { copy(cp.getAttribute('data-copy')); return; }
    var sd = t.closest('[data-send]');
    if (sd) { send(sd.getAttribute('data-send'), sd.getAttribute('data-code')); return; }
    var oc_ = t.closest('[data-open-code]');
    if (oc_) { openCode(oc_.getAttribute('data-open-code')); return; }
    var sg = t.closest('[data-sign]');
    if (sg && (t.closest('#s-chal') || t.closest('#s-cint') || t.closest('#s-result'))) { if (ctx.signIn) ctx.signIn(); return; }
  });
  var sc = $('s-chal');
  if (sc) {
    $('cb-back').addEventListener('click', function () { B.seq++; if (ctx.onHome) ctx.onHome(); });
    $('cb-tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) setTab(b.getAttribute('data-tab')); });
    sc.addEventListener('change', function (e) {
      if (!B.spec) return;
      if (e.target.id === 'cb-pitcher') {
        B.spec.pitcher = e.target.value;
        if (!built(B.spec.pitcher, B.spec.lineup)) {
          var l = B.opts.lineups.filter(function (x) { return built(B.spec.pitcher, x.id); })[0];
          B.spec.lineup = l ? l.id : null;
        }
        var ls = $('cb-lineup');
        [].forEach.call(ls.options, function (op) { var ok = built(B.spec.pitcher, op.value); op.disabled = !ok; op.selected = op.value === B.spec.lineup; });
        redrawPicks();
      } else if (e.target.id === 'cb-lineup') {
        B.spec.lineup = e.target.value;
        redrawPicks();
      }
    });
    $('cb-body').addEventListener('click', function (e) {
      if (!B.spec) return;
      var t = e.target.closest('button');
      if (!t) return;
      if (t.id === 'cb-make') { make(); return; }
      if (t.hasAttribute('data-up')) { setUp(+t.getAttribute('data-up')); redrawPicks(); return; }
      if (t.hasAttribute('data-run')) { if (setBase(+t.getAttribute('data-run'), +t.getAttribute('data-base'))) redrawPicks(); return; }
      if (t.hasAttribute('data-step')) { B.spec.them = Math.max(0, Math.min(20, B.spec.them + +t.getAttribute('data-step'))); redrawPicks(); return; }
      var g = t.closest('.cb-seg');
      if (g && t.hasAttribute('data-v')) {
        var f = g.getAttribute('data-f'), v = JSON.parse(t.getAttribute('data-v'));
        if (B.spec[f] === v) return;
        B.spec[f] = v;
        if (f === 'inning') tenth(B.spec);
        redrawPicks();
      }
    });
  }
  var ci = $('s-cint');
  if (ci) {
    $('ci-back').addEventListener('click', function () { V.seq++; if (ctx.onHome) ctx.onHome(); });
    ci.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ci]');
      if (!b) return;
      var k = b.getAttribute('data-ci');
      if (k === 'retry') { loading('Loading the challenge.'); reload(); }
      else if (k === 'practice') play(true);
      else play(false);
    });
  }
}

var api = {
  API_VERSION: 1,
  init: function (c) {
    for (var k in c) ctx[k] = c[k];
    if (!api.wired) {
      api.wired = true;
      wire();
      var slot = $('h-chal');
      if (slot) slot.innerHTML = cardHTML();
    }
  },
  /* the screens */
  open: openBuilder,
  fromLink: openCode,
  openCode: openCode,
  /* a sign-in or a post changed what the screen shows: draw it again */
  refresh: function () {
    var s = document.body.dataset.screen;
    if (s === 's-chal') openBuilder();
    else if (s === 's-cint' && V.code) reload();
  },
  reload: reload,
  view: function () { return V.view; },
  setView: function (v) { V.view = v; V.code = v ? v.code : V.code; },
  /* the result's parts */
  versus: versus,
  tileHTML: tileHTML,
  saveBlock: saveBlock,
  shareText: shareText,
  cardFields: cardFields,
  cardHTML: cardHTML,
  CODE_RE: /^[A-HJ-NP-Z2-9]{6}$/i,
};
window.STD_CHALLENGE_UI = api;
})();
