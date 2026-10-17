/* Shut The Door: the page.
 *
 * window.STD_UI. Builds against the four calls and nothing else
 * (CONTRACT.md section 9): getScenario, startOuting, throwPitch, finishOuting.
 * Every number a player reads here comes from what those return, or from the
 * contract's constants.
 *
 * Screens: home, the mound (the pitch plays out on the mound's own canvas),
 * the grade card over it, the result. The sheets live in menus.js.
 *
 * What the page keeps for itself, in localStorage, all small:
 *   std_ui_v1        settings, and whether the "the grade is the decision"
 *                    line has been shown
 *   std_ui_hist_v1   one row per finished daily (outcome, strip, percentile)
 *                    for the stats sheet and a guest's streak. The outing
 *                    itself is the API's to keep (std_outing_v1), never this
 *                    file's.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT, API = window.STD_API, M = window.STD_MOUND, AN = window.STD_ANIM, MN = window.STD_MENUS;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
var Q = new URLSearchParams(location.search);
var DEBUG = Q.get('debug') === '1';

/* ---- what the page keeps ---------------------------------------------------- */

var PREF_KEY = 'std_ui_v1', HIST_KEY = 'std_ui_hist_v1';
function readJSON(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } }
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
var prefs = readJSON(PREF_KEY, {});
if (prefs.sound == null) prefs.sound = true;
function savePrefs() { writeJSON(PREF_KEY, prefs); }
function hist() { return readJSON(HIST_KEY, {}); }
function record(day, number, r) {
  var h = hist();
  if (h[day]) return;
  h[day] = { number: number, outcome: r.outcome, strip: r.strip, percentile: r.percentile, pitches: r.pitches };
  writeJSON(HIST_KEY, h);
}

/* ---- state ------------------------------------------------------------------- */

var S = {
  day: C.easternDay(), scn: null, daily: null, dailyResult: null,
  outing: null, mode: 'daily', type: null, cell: null, busy: false,
  heat: null, scene: null, grid: null, mini: null, hero: null, result: null,
};

/* ---- small things ------------------------------------------------------------- */

var ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th', '13th', '14th', '15th'];
function ord(n) { return ORD[n] || n + 'th'; }
function handWord(h) { return h === 'L' ? 'left' : 'right'; }
function basesWords(b) {
  if (b === 0) return 'bases empty';
  if (b === 7) return 'bases loaded';
  var on = [];
  if (b & 1) on.push('first'); if (b & 2) on.push('second'); if (b & 4) on.push('third');
  return (on.length > 1 ? 'men on ' : 'man on ') + on.join(' and ');
}
function outsWords(o) { return o === 0 ? 'no outs' : o === 1 ? 'one out' : 'two outs'; }
function pitchOf(type) { var a = S.scn.pitcher.arsenal; for (var i = 0; i < a.length; i++) if (a[i].type === type) return a[i]; return null; }
function batterAt(i) { var bs = S.scn.batters; return bs[((i % bs.length) + bs.length) % bs.length]; }
function lastName(n) { var p = String(n).split(' '); return p[p.length - 1]; }
function fmtDay(day) {
  var d = new Date(Date.parse(day + 'T12:00:00Z'));
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).toLowerCase().replace(',', '');
}
function pct(v) { return Math.round(v * 100) + '%'; }
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 2200);
}
function stripHTML(strip, big) {
  return (strip || []).map(function (b, i) { return '<i class="sq ' + b + '" title="pitch ' + (i + 1) + ': ' + b + '"></i>'; }).join('');
}
function show(id) {
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('on', s.id === id); });
  document.body.dataset.screen = id;
  window.scrollTo(0, 0);
}

/* ---- sound: four noises made on the spot, nothing to download ---------------- */

var AC = null;
function audio() {
  if (!prefs.sound) return null;
  try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; }
  return AC;
}
function noise(ac, dur) {
  var n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  var s = ac.createBufferSource(); s.buffer = buf; return s;
}
function sound(name, delay) {
  var ac = audio(); if (!ac) return;
  try {
    var t0 = ac.currentTime + (delay ? delay / 1000 : 0);
    var g = ac.createGain(), f = ac.createBiquadFilter(), src;
    g.connect(ac.destination);
    if (name === 'pop') {
      src = noise(ac, 0.07); f.type = 'lowpass'; f.frequency.value = 1100; g.gain.setValueAtTime(0.5, t0);
      var o = ac.createOscillator(), og = ac.createGain(); o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(60, t0 + 0.08);
      og.gain.setValueAtTime(0.35, t0); og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1); o.connect(og); og.connect(ac.destination); o.start(t0); o.stop(t0 + 0.12);
    } else if (name === 'crack') {
      src = noise(ac, 0.05); f.type = 'highpass'; f.frequency.value = 1400; g.gain.setValueAtTime(0.6, t0);
    } else if (name === 'thud') {
      src = noise(ac, 0.09); f.type = 'lowpass'; f.frequency.value = 400; g.gain.setValueAtTime(0.5, t0);
    } else {
      src = noise(ac, 0.22); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t0); f.frequency.exponentialRampToValueAtTime(1800, t0 + 0.2); g.gain.setValueAtTime(0.07, t0);
    }
    src.connect(f); f.connect(g); src.start(t0);
  } catch (e) {}
}

/* ---- theme ---------------------------------------------------------------------- */

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('runthegrid_theme', t); } catch (e) {}
  var m = $('themeMeta'); if (m) m.setAttribute('content', t === 'dark' ? '#0f131a' : '#eee6d6');
  if (S.scene && S.scene.L) S.scene.draw(S.scene.frame);
  if (S.hero && S.hero.L) S.hero.draw(S.hero.frame);
}

/* ---- home ------------------------------------------------------------------------- */

function renderHome() {
  var s = S.scn, sit = s.situation, p = s.pitcher;
  $('h-day').textContent = '#' + s.number + ' · ' + fmtDay(s.day);
  $('h-title').textContent = s.title;
  $('h-setup').textContent = s.setup;
  var margin = sit.score.us - sit.score.them;
  $('h-sit').innerHTML =
    '<span><b>' + esc(sit.half === 'bottom' ? 'bot' : 'top') + ' ' + esc(ord(sit.inning)) + '</b></span>' +
    '<span>up ' + esc(sit.score.us) + '-' + esc(sit.score.them) + '</span>' +
    '<span>' + esc(basesWords(sit.bases)) + '</span><span>' + esc(outsWords(sit.outs)) + '</span>' +
    (sit.walkOffLive ? '<span class="hot">walk-off live</span>' : '');
  var ars = p.arsenal.map(function (a) {
    return '<li><span class="an">' + esc(a.name) + '</span><span class="av">' + esc(a.velo.toFixed(1)) + '</span>' +
      '<span class="au"><i style="width:' + Math.round(a.usage * 100) + '%"></i></span><span class="ap">' + esc(pct(a.usage)) + '</span></li>';
  }).join('');
  $('h-pitcher').innerHTML =
    '<div class="pc-top"><span class="swatch" style="background:' + esc(p.teamColors[0]) + ';border-color:' + esc(p.teamColors[1]) + '"></span>' +
    '<div><p class="pc-name">' + esc(p.name) + '</p><p class="quiet">' + esc(p.team) + ' · ' + esc(p.year) + ' · throws ' + esc(handWord(p.throws)) + '</p></div></div>' +
    '<ul class="ars"><li class="hd"><span>pitch</span><span>mph</span><span>usage</span></li>' + ars + '</ul>';
  var due = s.batters.slice(0, 3).map(function (b) {
    return '<li><b>' + esc(b.name) + '</b><span class="hand">' + esc(b.bats) + '</span><span class="quiet">' + esc(b.line) + '</span></li>';
  }).join('');
  $('h-due').innerHTML = '<p class="lbl">due up</p><ol>' + due + '</ol>';
  $('h-proxy').hidden = s.resolution !== 'proxy';
  $('m-proxy').hidden = s.resolution !== 'proxy';
  renderStreak();
  $('h-load').hidden = true;
  $('h-main').hidden = false;
  drawHero();
}

function streakNow() {
  var acct = S.dailyResult && S.dailyResult.account;
  if (acct) return { cur: acct.streak, best: acct.best };
  return MN.streakOf(hist(), S.day);
}
function renderStreak() {
  var st = streakNow();
  var line = '<b>' + st.cur + '</b> ' + (st.cur === 1 ? 'door' : 'doors') + ' shut in a row' + (st.best > st.cur ? ' · best ' + st.best : '');
  $('h-streak').innerHTML = line;
  var acct = S.mode === 'daily' && S.dailyResult && S.dailyResult.account;
  if (acct && acct.rank != null) line += ' · #' + acct.rank + ' of ' + acct.players + ' today';
  $('r-streak').innerHTML = S.mode === 'daily' ? line : '';
}

function renderHomeState() {
  var d = S.daily, r = S.dailyResult;
  var take = $('b-take');
  if (r) {
    $('h-go').hidden = true;
    var done = $('h-done');
    done.hidden = false;
    done.innerHTML =
      '<p class="lbl">today</p><p class="d-out ' + r.outcome + '">' + esc(C.OUTCOME_LABEL[r.outcome]) + '</p>' +
      '<div class="strip">' + stripHTML(r.strip) + '</div>' +
      '<p>' + esc(r.pitches) + ' pitches. better than ' + esc(Math.round(r.percentile)) + '% of closers.</p>' +
      '<div class="d-act"><button class="btn go" type="button" id="d-share">share</button>' +
      '<button class="btn ghost" type="button" id="d-see">see it again</button>' +
      '<button class="btn ghost" type="button" id="d-again">run it back</button></div>' +
      '<p class="quiet">back tomorrow for #' + esc(S.scn.number + 1) + '.</p>';
    $('d-share').addEventListener('click', function () { share(r); });
    $('d-see').addEventListener('click', function () { S.mode = 'daily'; S.result = r; renderResult(); show('s-result'); });
    $('d-again').addEventListener('click', practice);
  } else {
    $('h-go').hidden = false;
    $('h-done').hidden = true;
    take.textContent = d && d.pitchNo > 0 ? 'back to the mound · pitch ' + (d.pitchNo + 1) : 'take the mound';
  }
  renderStreak();
}

/* the hero: the same scene as the mound, small, with the first batter in */
function drawHero() {
  if (!S.hero) S.hero = new M.Scene($('h-canvas'), { hero: true });
  S.hero.setScenario(S.scn);
  S.hero.setBatter(S.scn.batters[0]);
  S.hero.layout();
  S.hero.draw({ pitcher: 'set', batter: 'stance' });
}

/* ---- the mound ----------------------------------------------------------------------- */

function buildMound() {
  if (S.scene) return;
  S.scene = new M.Scene($('m-canvas'));
  S.grid = new M.Grid($('m-scene'), { onPick: pickCell });
  /* the grid sits over the canvas, under the scout card and the callout */
  $('m-scene').insertBefore(S.grid.el, $('m-scout'));
  var ars = $('m-arsenal');
  ars.innerHTML = '';
  S.scn.pitcher.arsenal.forEach(function (a, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pitch';
    b.dataset.type = a.type;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<b>' + esc(a.name) + '</b><span>' + esc(Math.round(a.velo)) + ' · ' + esc(pct(a.usage)) + '</span>';
    b.addEventListener('click', function () { pickType(a.type); });
    ars.appendChild(b);
  });
  $('m-throw').addEventListener('click', throwIt);
  $('m-batter').addEventListener('click', toggleScout);
  window.addEventListener('resize', function () { if (document.body.dataset.screen === 's-mound') relayout(); if (S.hero) drawHero(); });
}

function relayout() {
  S.scene.layout();
  S.grid.place(S.scene.gridRect());
  S.scene.draw(idleFrame());
}
function idleFrame() {
  return { pitcher: 'set', batter: 'stance', umpire: 'set', mitt: S.cell != null ? S.scene.cellCenter(S.cell) : null, marker: S.lastMarker || null };
}

function enterMound() {
  buildMound();
  S.scene.setScenario(S.scn);
  S.type = null; S.cell = null; S.lastMarker = null;
  show('s-mound');
  setBatter(true);
  renderHud(S.outing);
  updateThrow();
  if (DEBUG) { $('m-dbg').hidden = false; $('m-dbg').textContent = 'seed ' + S.outing.seed + ' · ' + S.outing.mode; }
}

function setBatter(first) {
  var b = batterAt(S.outing.batterIndex);
  S.scene.setBatter(b);
  S.grid.setHand(b.bats);
  $('m-bname').textContent = b.name;
  $('m-bhand').textContent = 'bats ' + handWord(b.bats);
  $('m-bline').textContent = b.line;
  relayout();
  if (S.heat) { S.grid.setHeat(b.profile, S.heat); renderScout(); }
  if (!first) flash(b.name + ' up');
}

function renderHud(st) {
  var sit = S.scn.situation;
  $('m-us').textContent = st.score.us;
  $('m-them').textContent = st.score.them;
  $('m-inn').innerHTML = '<b>' + (sit.half === 'bottom' ? 'bot' : 'top') + '</b> ' + sit.inning;
  $('m-count').textContent = st.count.b + '-' + st.count.s;
  $('m-pn').textContent = st.status === 'live' ? st.pitchNo + 1 : st.pitchNo;
  var bs = $('m-bases');
  bs.querySelector('.b1').classList.toggle('on', !!(st.bases & 1));
  bs.querySelector('.b2').classList.toggle('on', !!(st.bases & 2));
  bs.querySelector('.b3').classList.toggle('on', !!(st.bases & 4));
  var outs = $('m-outs').children;
  for (var i = 0; i < outs.length; i++) outs[i].classList.toggle('on', i < st.outs);
  $('m-strip').innerHTML = stripHTML(st.strip) + (st.status === 'live' ? '<i class="sq next"></i>' : '');
}

/* the scorebar's diamond during a play: a dot per runner on the same base
   paths the field inset uses, a red one for a runner put out */
function hudRunners(list) {
  var g = $('m-runners'), svg = $('m-bases');
  if (!list) { g.innerHTML = ''; svg.classList.remove('running'); return; }
  svg.classList.add('running');
  g.innerHTML = list.map(function (r) {
    var q = M.pathXY(r.p);
    return '<circle cx="' + (19.5 + 11 * q[0]).toFixed(1) + '" cy="' + (17.5 + 10.5 * q[1]).toFixed(1) + '" r="3.2" class="' + (r.out ? 'out' : '') + '" opacity="' + (r.alpha == null ? 1 : r.alpha) + '"/>';
  }).join('');
}

function pickType(t) {
  if (S.busy) return;
  S.type = t;
  document.querySelectorAll('#m-arsenal .pitch').forEach(function (b) {
    var on = b.dataset.type === t; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  updateThrow();
}
function pickCell(c) {
  if (S.busy) return;
  S.cell = c;
  S.grid.setSelected(c);
  S.lastMarker = null;
  S.grid.setMarks({});
  S.scene.draw(idleFrame());
  updateThrow();
}
function updateThrow() {
  var b = $('m-throw'), bt = batterAt(S.outing.batterIndex);
  var ready = S.type && S.cell != null && !S.busy;
  b.disabled = !ready;
  b.classList.toggle('shut', !!(ready && S.outing.shutItLive));
  if (S.busy) { b.textContent = 'pitching'; return; }
  if (!S.type && S.cell == null) b.textContent = 'pick a pitch and a spot';
  else if (!S.type) b.textContent = 'pick a pitch';
  else if (S.cell == null) b.textContent = 'pick a spot';
  else {
    var verb = S.outing.shutItLive ? 'shut it' : 'throw';
    b.innerHTML = '<b>' + verb + '</b><span>' + esc(pitchOf(S.type).name) + ' · ' + esc(M.cellWords(S.cell, bt.bats)) + '</span>';
  }
}

function toggleScout() {
  S.heat = S.heat ? null : 'damage';
  renderScout();
}
function renderScout() {
  var b = batterAt(S.outing.batterIndex), pr = b.profile, box = $('m-scout');
  $('m-batter').setAttribute('aria-expanded', S.heat ? 'true' : 'false');
  $('m-batter').classList.toggle('on', !!S.heat);
  S.grid.setHeat(pr, S.heat);
  if (!S.heat) { box.hidden = true; return; }
  var wh = S.scn.pitcher.arsenal.map(function (a) {
    var v = pr.whiff[a.type];
    return '<span><b>' + (v == null ? '-' : pct(v)) + '</b> ' + esc(a.name) + '</span>';
  }).join('');
  var H = M.HEAT[S.heat];
  box.hidden = false;
  box.innerHTML =
    '<div class="sc-row"><span><b>' + pct(pr.chase) + '</b> chase</span><span><b>' + pct(pr.zoneSwing) + '</b> zone swing</span></div>' +
    '<div class="sc-row wh"><span class="lbl">whiffs</span>' + wh + '</div>' +
    '<div class="sc-row"><div class="seg sm" role="tablist">' +
    '<button type="button" data-heat="damage" aria-selected="' + (S.heat === 'damage') + '">damage</button>' +
    '<button type="button" data-heat="swing" aria-selected="' + (S.heat === 'swing') + '">swings</button></div>' +
    '<span class="legend"><i class="lo"></i>' + esc(H.fmt(H.lo)) + '<i class="hi"></i>' + esc(H.fmt(H.hi)) + '</span></div>' +
    (pr.notes && pr.notes[0] ? '<p class="sc-note">' + esc(pr.notes[0]) + '</p>' : '') +
    (b.profileTier !== 'batter' ? '<p class="sc-note quiet">profile from ' + (b.profileTier === 'similar' ? 'similar hitters' : 'the league') + '</p>' : '');
  box.querySelectorAll('[data-heat]').forEach(function (x) {
    x.addEventListener('click', function (e) { e.stopPropagation(); S.heat = x.dataset.heat; renderScout(); });
  });
}

function flash(text) {
  var f = $('m-flash');
  f.textContent = text; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
}
function callout(text, kind) {
  var c = $('m-call');
  c.className = 'callout ' + (kind || '');
  c.textContent = text;
  void c.offsetWidth;
  c.classList.add('on');
}

function throwIt() {
  if (S.busy || !S.type || S.cell == null || S.outing.status !== 'live') return;
  S.busy = true;
  audio();
  var call = { type: S.type, cell: S.cell };
  updateThrow();
  S.grid.setDisabled(true);
  var heatWas = S.heat;
  if (S.heat) { S.heat = null; renderScout(); }
  $('m-scene').classList.add('flying');
  $('m-call').className = 'callout';
  API.throwPitch(S.outing.outingId, call).then(function (res) {
    var pr = res.pitchResult;
    return AN.play(S.scene, {
      pr: pr, ap: pitchOf(pr.call.type), quick: !!prefs.quick,
      hooks: { call: callout, sound: sound, field: hudRunners },
    }).then(function () {
      S.lastMarker = S.scene.toScreen(pr.actual);
      $('m-scene').classList.remove('flying');
      S.grid.setMarks({ target: pr.call.cell, actual: pr.actualCell });
      hudRunners(null);
      renderHud(res.state);
      if (pr.runs) flash('+' + pr.runs + (pr.runs === 1 ? ' run' : ' runs'));
      return gradeCard(pr, res.pitchGrade, res.state);
    }).then(function () {
      S.outing = res.state;
      $('m-call').className = 'callout';
      S.busy = false;
      S.grid.setDisabled(false);
      S.grid.setSelected(null);
      S.grid.setMarks({});
      S.cell = null; S.type = null; S.lastMarker = null;
      document.querySelectorAll('#m-arsenal .pitch').forEach(function (b) { b.classList.remove('sel'); b.setAttribute('aria-pressed', 'false'); });
      if (S.outing.status === 'over') return finish();
      if (pr.paOver) setBatter(false); else S.scene.draw(idleFrame());
      if (heatWas) { S.heat = heatWas; renderScout(); }
      renderHud(S.outing);
      updateThrow();
    });
  }).catch(function (e) {
    S.busy = false;
    S.grid.setDisabled(false);
    $('m-scene').classList.remove('flying');
    updateThrow();
    toast('that pitch did not go. try again.');
    if (window.console) console.warn(e);
  });
}

/* ---- the grade card ------------------------------------------------------------------ */

var HITS = { single: 1, double: 1, triple: 1, home_run: 1 };
function gradeCard(pr, g, st) {
  var bt = batterAt(S.outing.batterIndex);
  var you = pitchOf(pr.call.type).name + ' · ' + M.cellWords(pr.call.cell, bt.bats);
  var same = g.bestCall && g.bestCall.type === pr.call.type && g.bestCall.cell === pr.call.cell;
  var best = g.bestCall ? pitchOf(g.bestCall.type).name + ' · ' + M.cellWords(g.bestCall.cell, bt.bats) : '';
  $('g-pill').className = 'pill ' + g.band;
  $('g-pill').textContent = g.band;
  $('g-head').textContent = same || g.lost <= 0.05 ? 'the best call' : g.band === 'green' ? 'close to the best' : g.lost.toFixed(1) + ' pts of hold lost';
  $('g-you').innerHTML = '<span class="lbl">you</span>' + esc(you);
  $('g-best').innerHTML = same ? '' : '<span class="lbl">best</span>' + esc(best);
  $('g-best').hidden = same;
  $('g-reason').textContent = g.reason;
  $('g-hold').textContent = 'hold ' + g.value.toFixed(1) + '% · best ' + g.best.toFixed(1) + '%';
  if (!S.mini) S.mini = new M.Grid($('g-mini'), { mini: true });
  S.mini.setHand(bt.bats);
  S.mini.setMarks({ target: pr.call.cell, actual: pr.actualCell, best: g.bestCall ? g.bestCall.cell : null });
  var hit = pr.result === 'in_play' && pr.inPlay && HITS[pr.inPlay.result];
  var note = g.band === 'green' && hit && !prefs.seenGreenHit;
  $('g-note').hidden = !note;
  if (note) { prefs.seenGreenHit = true; savePrefs(); }
  if (DEBUG) {
    $('g-dbg').hidden = false;
    $('g-dbg').textContent = 'tier ' + pr.drawn.tier + ' · ' + pr.drawn.id + ' · re ' + g.reDelta + ' · ' + pr.velo + ' mph';
  }
  var card = $('g-card');
  card.className = 'gcard ' + g.band;
  card.hidden = false;
  requestAnimationFrame(function () { card.classList.add('on'); });
  return new Promise(function (done) {
    var armed = false;
    setTimeout(function () { armed = true; }, 250);
    function go(e) {
      if (!armed) return;
      if (e && e.type === 'keydown' && !/Enter| |Escape/.test(e.key)) return;
      if (e && e.target && e.target.closest && e.target.closest('header')) return;
      document.removeEventListener('pointerup', go, true);
      document.removeEventListener('keydown', go, true);
      if (e && e.preventDefault) e.preventDefault();
      card.classList.remove('on');
      card.hidden = true;
      done();
    }
    document.addEventListener('pointerup', go, true);
    document.addEventListener('keydown', go, true);
  });
}

/* ---- the end ----------------------------------------------------------------------------- */

function finish() {
  return API.finishOuting(S.outing.outingId).then(function (r) {
    S.result = r;
    if (S.mode === 'daily') {
      S.dailyResult = r;
      S.daily = S.outing;
      record(S.day, S.scn.number, r);
    }
    renderResult();
    show('s-result');
    renderHomeState();
  });
}

function renderResult() {
  var r = S.result, s = S.scn, st = S.mode === 'daily' ? S.daily || S.outing : S.outing;
  var runs = st ? st.score.them - s.situation.score.them : null;
  $('r-eyebrow').textContent = S.mode === 'practice' ? 'practice · not scored' : '#' + s.number + ' · ' + s.title.toLowerCase();
  var o = $('r-outcome');
  o.textContent = C.OUTCOME_LABEL[r.outcome];
  o.className = 'outcome ' + r.outcome;
  $('r-line').textContent = r.pitches + ' pitches.' + (runs != null ? ' ' + runs + (runs === 1 ? ' run.' : ' runs.') : '');
  $('r-strip').innerHTML = stripHTML(r.strip, true);
  $('r-pct').textContent = Math.round(r.percentile) + '%';
  $('r-like').textContent = r.pitchedLike ? r.pitchedLike.name : '-';
  $('r-why').textContent = r.pitchedLike ? r.pitchedLike.reason : '';
  var rv = r.reveal || {};
  var vs = { beat: 'you beat him.', matched: 'you matched him.', lost: 'he did better.' }[r.vsReal] || '';
  var pas = (rv.plateAppearances || []).map(function (p) {
    return '<li><b>' + esc(p.batter) + '</b><span>' + esc(p.result) + '</span><span class="quiet">' + esc(p.pitches) + ' p</span></li>';
  }).join('');
  $('r-reveal').innerHTML =
    '<p class="lbl">what ' + esc(s.pitcher.name) + ' did</p>' +
    '<p class="rv-out ' + esc(rv.outcome) + '">' + esc(C.OUTCOME_LABEL[rv.outcome] || '') + '<span class="quiet"> · ' + esc(rv.pitches == null ? (rv.pitchesNote || 'pitch count unknown') : rv.pitches + ' pitches') + ' · ' + esc(rv.runs) + (rv.runs === 1 ? ' run' : ' runs') + '</span></p>' +
    '<p>' + esc(rv.summary) + '.</p>' +
    (pas ? '<ul class="pas">' + pas + '</ul>' : '') +
    '<p class="vs ' + esc(r.vsReal) + '">' + vs + '</p>';
  $('r-share').hidden = S.mode !== 'daily';
  $('r-tomorrow').textContent = S.mode === 'daily' ? 'back tomorrow for #' + (s.number + 1) + '.' : '';
  renderStreak();
}

function share(r) {
  var text = r.share || (window.STD_SHARE && window.STD_SHARE.text(r, S.scn.number)) || '';
  function copied() { toast('copied. paste it anywhere.'); }
  function fallback() {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); copied();
    } catch (e) { toast('could not copy.'); }
  }
  var touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (navigator.share && touch) {
    navigator.share({ text: text }).catch(function () {});
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(copied, fallback);
  else fallback();
}

function practice() {
  var seed = 1;
  try { var a = new Uint32Array(1); crypto.getRandomValues(a); seed = a[0] || 1; } catch (e) { seed = (Date.now() >>> 0) || 1; }
  API.startOuting(S.scn.id, seed, { mode: 'practice' }).then(function (st) {
    S.mode = 'practice';
    S.outing = st;
    enterMound();
    flash('practice. not scored.');
  });
}

function takeMound() {
  S.mode = 'daily';
  var go = S.daily && S.daily.status === 'live' ? Promise.resolve(S.daily) : API.startOuting(S.scn.id, null, { mode: 'daily' });
  go.then(function (st) {
    S.daily = st;
    S.outing = st;
    if (st.status === 'over') return finish();
    enterMound();
  });
}

/* ---- boot --------------------------------------------------------------------------------- */

function boot() {
  try { if (window.STD_AUTH && window.STD_AUTH.boot) window.STD_AUTH.boot(); } catch (e) {}
  try {
    if (window.STD_AUTH && window.STD_AUTH.onChange) window.STD_AUTH.onChange(function () {
      var st = window.STD_AUTH.state() || {};
      $('b-profile').classList.toggle('in', !!st.signedIn);
      $('b-profile').setAttribute('aria-label', st.signedIn ? 'Account' : 'Sign in');
      if (MN.current() === 'sheet-auth') MN.renderAuth();
    });
  } catch (e) {}
  MN.init({
    hist: hist, today: S.day, prefs: prefs,
    onPref: function (k, v) {
      if (k === 'theme') { setTheme(v); return; }
      prefs[k] = v; savePrefs();
      if (k === 'sound' && v) sound('pop');
    },
  });
  $('b-theme').addEventListener('click', function () {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  $('b-take').addEventListener('click', takeMound);
  $('r-again').addEventListener('click', practice);
  $('r-home').addEventListener('click', function () { renderHomeState(); show('s-home'); drawHero(); });
  $('r-share').addEventListener('click', function () { if (S.result) share(S.result); });

  API.getScenario(S.day).then(function (scn) {
    S.scn = scn;
    MN.init({ scn: scn });
    renderHome();
    /* learn today's state: startOuting returns the stored outing if there is
       one, and nothing is written until a pitch is thrown */
    return API.startOuting(scn.id, null, { mode: 'daily' }).then(function (st) {
      S.daily = st;
      if (st.status === 'over') return API.finishOuting(st.outingId).then(function (r) { S.dailyResult = r; record(S.day, scn.number, r); });
    });
  }).then(function () {
    renderHomeState();
  }).catch(function (e) {
    $('h-load').hidden = true;
    var er = $('h-err');
    er.hidden = false;
    er.innerHTML = '<p>today\'s spot did not load.</p><button class="btn ghost" type="button" onclick="location.reload()">try again</button>';
    if (window.console) console.warn(e);
  });
}

window.STD_UI = { state: S, cellWords: M.cellWords };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
