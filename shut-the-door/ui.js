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

/* ---- the mound's scene: 3D, or the old drawing -----------------------------------
   The 3D scene (3d/boot.js, window.STD_STAGE, which imports 3d/stage.js when asked) is a module,
   so it arrives after this script.
   use3d(): WebGL here and the module on the page. The mound's scene object keeps the old
   drawing's calls (setScenario, setBatter, layout, gridRect, toScreen, cellCenter, draw), plus
   setTarget and play for the 3D one. Until the module has run, Pending keeps the calls and hands
   them over when it does. Without WebGL the old drawing stays, the only place it is used. */
function use3d() {
  if (window.STD_STAGE) return window.STD_STAGE.supported();
  if (!document.querySelector('script[src*="3d/boot.js"]')) return false;
  try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
function Pending(canvas) {
  this.is3d = true; this.canvas = canvas; this.calls = []; this.real = null;
  var self = this;
  this.arrived = new Promise(function (res) {
    function go() {
      window.STD_STAGE.create(canvas).then(function (st) {
        self.real = st;
        self.calls.forEach(function (c) { st[c[0]].apply(st, c[1]); });
        self.calls = null;
        res(st);
      });
    }
    if (window.STD_STAGE) go(); else window.addEventListener('std-stage', go, { once: true });
  });
}
['setScenario', 'setBatter', 'setTarget', 'layout', 'draw'].forEach(function (n) {
  Pending.prototype[n] = function () { if (this.real) return this.real[n].apply(this.real, arguments); this.calls.push([n, [].slice.call(arguments)]); };
});
Pending.prototype.gridRect = function () {
  if (this.real) return this.real.gridRect();
  var w = this.canvas.clientWidth, h = this.canvas.clientHeight, gw = Math.min(w * 0.6, h * 0.5);
  return { x: (w - gw) / 2, y: h * 0.32, w: gw, h: gw };
};
Pending.prototype.toScreen = function (p) { return this.real ? this.real.toScreen(p) : { x: 0, y: 0 }; };
Pending.prototype.cellCenter = function (c) { return this.real ? this.real.cellCenter(c) : { x: 0, y: 0 }; };
Pending.prototype.figureBoxes = function () { return this.real.figureBoxes(); };
Object.defineProperty(Pending.prototype, 'bat', { get: function () { return this.real ? this.real.bat : null; } });
Pending.prototype.play = function (opts) { return this.arrived.then(function (st) { return st.play(opts); }); };

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
  return (strip || []).map(function (b, i) { return '<i class="sq ' + b + '" title="pitch ' + (i + 1) + ': ' + b + '">' + (big ? i + 1 : '') + '</i>'; }).join('');
}
function ordSuffix(n) { var t = n % 100; if (t >= 11 && t <= 13) return 'th'; return ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; }
/* the colours of the break chart and the arsenal list, in usage order */
var PITCH_COLORS = ['#ff4f1f', '#2b59ff', '#8b5cf6', '#14b8a6', '#f2b827', '#ec4899', '#64748b'];
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

/* The spot in plain words, read from the pack's own fields: "bottom of the 9th. up 1.
   nobody out. runner on second." Each part comes from a field the pack has; a part it
   does not have is left out, never filled in. */
function situationLine(sit) {
  var parts = [];
  if (sit.inning != null) {
    var half = sit.half === 'top' || sit.half === 'bottom' ? sit.half + ' of the ' : '';
    parts.push(half + sit.inning + ordSuffix(sit.inning));
  }
  if (sit.score) {
    var m = sit.score.us - sit.score.them;
    parts.push(m > 0 ? 'up ' + m : m < 0 ? 'down ' + -m : 'tied');
  }
  if (sit.outs != null) parts.push(sit.outs === 0 ? 'nobody out' : sit.outs === 1 ? 'one out' : 'two outs');
  if (sit.bases != null) parts.push(runnersLine(sit.bases | 0));
  return parts.join('. ') + '.';
}
function runnersLine(b) {
  var on = [];
  if (b & 1) on.push('first'); if (b & 2) on.push('second'); if (b & 4) on.push('third');
  if (!on.length) return 'nobody on';
  if (on.length === 3) return 'bases loaded';
  return (on.length > 1 ? 'runners on ' : 'runner on ') + on.join(' and ');
}

function renderHome() {
  var s = S.scn, sit = s.situation, p = s.pitcher;
  /* the chips: only what the pack has. A null number or day is left out, never printed as "#" */
  var chips = ['<span class="chip-s hot">real save</span>'];
  if (s.number != null) chips.push('<span class="chip-s">#' + esc(s.number) + ' \u00b7 today</span>');
  if (s.day) chips.push('<span class="chip-s">' + esc(fmtDay(s.day)) + '</span>');
  if (s.resolution === 'proxy') chips.push('<span class="chip-s quiet">modern pitch data</span>');
  $('h-day').innerHTML = chips.join('');
  $('h-title').textContent = s.title.toLowerCase();
  $('h-head').textContent = situationLine(sit);
  var b = sit.bases | 0;
  $('h-b1').classList.toggle('on', !!(b & 1));
  $('h-b2').classList.toggle('on', !!(b & 2));
  $('h-b3').classList.toggle('on', !!(b & 4));
  $('h-setup').textContent = s.setup;
  var bat = s.batters[0];
  $('h-bat').innerHTML = bat ? '<p class="lbl">at the plate</p><p class="hb-name"><b>' + esc(bat.name) + '</b>' +
    (bat.bats ? ' <span class="hand">' + esc(bat.bats) + '</span>' : '') + '</p>' +
    (bat.line ? '<p class="quiet">' + esc(bat.line) + '</p>' : '') : '';
  var on = sit.bases === 0 ? 'none' : sit.bases === 7 ? 'loaded' : [1, 2, 4].filter(function (b) { return sit.bases & b; }).map(function (b) { return { 1: '1st', 2: '2nd', 4: '3rd' }[b]; }).join(', ');
  $('h-sit').innerHTML =
    '<div class="tl"><b>' + esc(sit.score.us) + '-' + esc(sit.score.them) + '</b><span>your lead</span></div>' +
    '<div class="tl"><b>' + esc(sit.outs) + '</b><span>' + (sit.outs === 1 ? 'out' : 'outs') + '</span></div>' +
    '<div class="tl"><b>' + esc(on) + '</b><span>on base</span></div>' +
    '<div class="tl' + (sit.walkOffLive ? ' hot' : '') + '"><b>' + (sit.walkOffLive ? 'live' : 'no') + '</b><span>walk-off</span></div>';
  var ordered = p.arsenal.slice().sort(function (a, b) { return b.usage - a.usage; });
  var ars = ordered.map(function (a, i) {
    return '<li><i class="dot" style="background:' + PITCH_COLORS[i % PITCH_COLORS.length] + '"></i><span class="an">' + esc(a.name) + '</span>' +
      '<span class="av">' + esc(a.velo.toFixed(1)) + '</span><span class="ap">' + esc(pct(a.usage)) + '</span></li>';
  }).join('');
  var chart = breakChart(ordered, p.throws);
  var club = [p.team, p.year, p.throws ? 'throws ' + handWord(p.throws) : ''].filter(Boolean).map(esc).join(' \u00b7 ');
  $('h-pitcher').innerHTML =
    '<p class="lbl">the real pitcher</p>' +
    '<div class="pc-top"><span class="swatch" style="background:' + esc(p.teamColors[0]) + ';border-color:' + esc(p.teamColors[1]) + '"></span>' +
    '<div><p class="pc-name">' + esc(p.name) + '</p><p class="quiet">' + club + '</p></div></div>' +
    '<div class="pc-body' + (chart ? '' : ' flat') + '">' + (chart ? '<div class="brk">' + chart + '</div>' : '') + '<ul class="ars">' + ars + '</ul></div>';
  var due = s.batters.slice(0, 3).map(function (b) {
    return '<li><b>' + esc(b.name) + '</b><span class="hand">' + esc(b.bats) + '</span><span class="quiet">' + esc(b.line) + '</span></li>';
  }).join('');
  $('h-due').innerHTML = '<div class="ch"><b>due up</b><span>the real order</span></div><ol>' + due + '</ol>';
  $('h-proxy').hidden = s.resolution !== 'proxy';
  $('m-proxy').hidden = s.resolution !== 'proxy';
  renderStreak();
  $('h-load').hidden = true;
  $('h-main').hidden = false;
  drawHero();
}

/* The arsenal as a break chart, seen from the pitcher's side: induced vertical
   break up, horizontal break with arm side marked. pfx is catcher's view in
   the data, so x is mirrored, as the grid is. Dots sized by usage. Null when
   the pack has no movement. */
function breakChart(ars, throws) {
  if (!ars.length || ars.some(function (a) { return a.pfxX == null || a.pfxZ == null; })) return '';
  var m = 20;
  ars.forEach(function (a) { m = Math.max(m, Math.abs(a.pfxX) + 3, Math.abs(a.pfxZ) + 3); });
  var c = 74, r = 60, k = r / m;
  var dots = ars.map(function (a, i) {
    var x = c - a.pfxX * k, y = c - a.pfxZ * k, rad = 5 + Math.sqrt(a.usage) * 13;
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rad.toFixed(1) + '" fill="' + PITCH_COLORS[i % PITCH_COLORS.length] + '" fill-opacity=".92"><title>' + esc(a.name) + '</title></circle>';
  }).reverse().join('');
  var armRight = throws !== 'L';
  return '<svg viewBox="0 0 148 148" role="img" aria-label="his pitches by movement">' +
    '<line x1="' + c + '" y1="10" x2="' + c + '" y2="138" stroke="currentColor" stroke-opacity=".18"/>' +
    '<line x1="10" y1="' + c + '" x2="138" y2="' + c + '" stroke="currentColor" stroke-opacity=".18"/>' +
    '<circle cx="' + c + '" cy="' + c + '" r="' + (r * 0.5) + '" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-dasharray="2 3"/>' +
    dots +
    '<text x="12" y="20">more rise</text>' +
    '<text x="' + (armRight ? 136 : 12) + '" y="140" text-anchor="' + (armRight ? 'end' : 'start') + '">' + (armRight ? 'arm side \u203a' : '\u2039 arm side') + '</text></svg>';
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
  /* with the 3D scene, the hero is a still of it (and its downloads are already on the way) */
  if (use3d()) { $('h-canvas').hidden = true; $('h-poster').hidden = false; warm3d(); return; }
  if (!S.hero) S.hero = new M.Scene($('h-canvas'), { hero: true });
  S.hero.setScenario(S.scn);
  S.hero.setBatter(S.scn.batters[0]);
  S.hero.layout();
  S.hero.draw({ pitcher: 'set', batter: 'stance' });
}

/* The 3D mound starts on the home screen: its downloads, the people for today's spot and the
   first hitter, and its shaders, all while the player reads the spot. Take the mound then only
   sizes it and draws. */
function warm3d() {
  if (S.scene || !S.scn) return;
  S.scene = new Pending($('m-canvas'));
  S.scene.setScenario(S.scn);
  S.scene.setBatter(S.scn.batters[0]);
}

/* ---- the mound ----------------------------------------------------------------------- */

function buildMound() {
  if (S.grid) return;
  if (!S.scene) S.scene = use3d() ? new Pending($('m-canvas')) : new M.Scene($('m-canvas'));
  $('m-scene').classList.toggle('s3d', !!S.scene.is3d);
  /* the 3D module lands after this: put the grid on its zone then */
  if (S.scene.arrived) S.scene.arrived.then(function (st) { return st.ready; }).then(function () { if (document.body.dataset.screen === 's-mound') relayout(); });
  S.grid = new M.Grid($('m-scene'), { onPick: pickCell });
  /* the grid sits over the canvas, under the scout card and the callout */
  $('m-scene').insertBefore(S.grid.el, $('m-scout'));
  var ars = $('m-arsenal');
  ars.innerHTML = '';
  ars.dataset.n = S.scn.pitcher.arsenal.length;
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
  if (S.outing.pitchNo === 0) pbp('', batterAt(S.outing.batterIndex).name + ' leads off.');
  else pbp('', 'pitch ' + (S.outing.pitchNo + 1) + '. ' + batterAt(S.outing.batterIndex).name + ' up.');
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
  if (!first) pbp('', b.name + ' up.');
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
  if (S.scene.setTarget) S.scene.setTarget(c);
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

/* The play by play: one quiet line under the scoreboard. It covers nothing
   and needs no tap. No grade, no colour, no tip ever shows during play (the
   owner, 2026-10-17): that all waits for the coach at the end. */
/* A tag (the result, in capitals) and the rest of the line. The tag is the thing a player reads
   first: the swing's result under the scoreboard, in the same place after every pitch. */
function pbp(tag, rest) {
  var el = $('m-pbp');
  el.innerHTML = '<b class="pbp-tag">' + esc(tag || '') + '</b> <span class="pbp-rest">' + esc(rest || '') + '</span>';
  el.classList.remove('new'); void el.offsetWidth; el.classList.add('new');
}
var COUNT_WORD = ['', 'one', 'two', 'three'];
var HIT_TAG = { single: 'single', double: 'double', triple: 'triple', home_run: 'home run', error: 'error',
  out_ground: 'ground out', out_line: 'line out', out_fly: 'fly out', out_popup: 'pop out' };
function playText(pr, batter) {
  var who = lastName(batter.name), res = pr.result, c = pr.count, tag, rest;
  var count = c.b + '-' + c.s;
  if (res === 'in_play' && pr.inPlay) { tag = HIT_TAG[pr.inPlay.result] || 'in play'; rest = who + ': ' + pr.inPlay.text + '.'; }
  else if (res === 'hit_by_pitch') { tag = 'hit by pitch'; rest = who + '. ' + count; }
  else if (res === 'ball') { tag = pr.paOver ? 'walk' : 'ball'; rest = pr.paOver ? who + '. ' + count : count; }
  else if (res === 'foul') { tag = 'foul'; rest = count; }
  else if (pr.paOver) { tag = 'strikeout'; rest = who + ', ' + (res === 'called_strike' ? 'looking' : 'swinging'); }
  else { tag = res === 'called_strike' ? 'called strike' : res === 'foul_tip' ? 'foul tip' : 'swinging strike'; rest = count; }
  if (pr.runs) rest += ' · ' + (pr.runs === 1 ? 'a run scores' : (COUNT_WORD[pr.runs] || pr.runs) + ' runs score');
  return { tag: tag, rest: rest };
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
  API.throwPitch(S.outing.outingId, call).then(function (res) {
    var pr = res.pitchResult, batter = batterAt(S.outing.batterIndex);
    var opts = {
      pr: pr, ap: pitchOf(pr.call.type), quick: !!prefs.quick,
      hooks: { call: function () { var t = playText(pr, batter); pbp(t.tag, t.rest); }, sound: sound, field: hudRunners },
    };
    return (S.scene.is3d ? S.scene.play(opts) : AN.play(S.scene, opts)).then(function () {
      S.lastMarker = S.scene.toScreen(pr.actual);
      $('m-scene').classList.remove('flying');
      S.grid.setMarks({ target: pr.call.cell, actual: pr.actualCell });
      hudRunners(null);
      renderHud(res.state);
      S.outing = res.state;
      S.busy = false;
      S.grid.setDisabled(false);
      S.grid.setSelected(null);
      S.cell = null; S.type = null;
      document.querySelectorAll('#m-arsenal .pitch').forEach(function (b) { b.classList.remove('sel'); b.setAttribute('aria-pressed', 'false'); });
      if (S.outing.status === 'over') return finish();
      if (S.scene.setTarget) S.scene.setTarget(null);
      if (pr.paOver) { S.lastMarker = null; S.grid.setMarks({}); setBatter(false); } else S.scene.draw(idleFrame());
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
  var runs = r.runs != null ? r.runs : st ? st.score.them - s.situation.score.them : null;
  $('r-eyebrow').textContent = S.mode === 'practice' ? 'practice \u00b7 not scored' : '#' + s.number + ' \u00b7 final \u00b7 ' + s.title.toLowerCase();
  var o = $('r-outcome');
  o.textContent = C.OUTCOME_LABEL[r.outcome];
  o.className = 'outcome ' + r.outcome;
  $('r-line').textContent = r.pitches + ' pitches.' + (runs != null ? ' ' + runs + (runs === 1 ? ' run.' : ' runs.') : '');
  $('r-npitch').textContent = r.pitches + (r.pitches === 1 ? ' pitch' : ' pitches');
  $('r-strip').innerHTML = stripHTML(r.strip, true);
  var WORD = { green: 'the call', yellow: 'close', orange: 'costly', red: 'wrong idea' };
  $('r-legend').innerHTML = C.BANDS.map(function (b) { return '<span><i class="sq ' + b.band + '"></i>' + WORD[b.band] + '</span>'; }).join('');
  var p = Math.round(r.percentile);
  $('r-pct').innerHTML = p + '<sup>' + ordSuffix(p) + '</sup>';
  $('r-pctline').textContent = 'better than ' + p + '% of the closer pool in this spot.';
  $('r-score').textContent = r.score != null ? 'score ' + r.score : '';
  $('r-chart').innerHTML = poolChart(r);
  $('r-like').textContent = r.pitchedLike ? r.pitchedLike.name : '-';
  $('r-why').textContent = r.pitchedLike ? r.pitchedLike.reason : '';
  var rv = r.reveal || {};
  var VS = { beat: 'you beat him', matched: 'you matched him', lost: 'he did better' };
  var rvPitches = rv.pitches == null ? (rv.pitchesNote || 'pitch count unknown') : rv.pitches + ' pitches';
  $('r-real').innerHTML = '<small>the real one</small><b class="vs ' + esc(r.vsReal) + '">' + esc(VS[r.vsReal] || '-') + '</b>' +
    '<span>' + esc(lastName(s.pitcher.name)) + ': ' + esc((C.OUTCOME_LABEL[rv.outcome] || '').toLowerCase()) + '. ' + esc(rvPitches) + '. ' + esc(rv.runs) + (rv.runs === 1 ? ' run.' : ' runs.') + '</span>';
  var pas = (rv.plateAppearances || []).map(function (pa) {
    return '<li><b>' + esc(pa.batter) + '</b><span>' + esc(pa.result) + '</span><span class="quiet">' + esc(pa.pitches) + ' p</span></li>';
  }).join('');
  $('r-reveal').innerHTML =
    '<div class="ch"><b>what ' + esc(s.pitcher.name.toLowerCase()) + ' did</b><span>' + esc(rvPitches) + '</span></div>' +
    '<p class="rv-out ' + esc(rv.outcome) + '">' + esc(C.OUTCOME_LABEL[rv.outcome] || '') + '<span class="quiet"> \u00b7 ' + esc(rv.runs) + (rv.runs === 1 ? ' run' : ' runs') + '</span></p>' +
    '<p>' + esc(rv.summary) + '.</p>' +
    (pas ? '<ul class="pas">' + pas + '</ul>' : '');
  $('r-share').hidden = S.mode !== 'daily';
  $('r-tomorrow').textContent = S.mode === 'daily' ? 'back tomorrow for #' + (s.number + 1) + '.' : '';
  renderStreak();
}

/* Your score on the real distribution of the closer pool's outings in this
   spot (pack.pool.scores), when the result carries them as result.pool.
   Without them, a plain meter at the percentile. */
function poolChart(r) {
  var scores = r.pool && r.pool.scores;
  var p = Math.max(0, Math.min(100, Math.round(r.percentile)));
  if (!Array.isArray(scores) || scores.length < 20 || r.score == null) {
    return '<div class="meter" role="img" aria-label="better than ' + p + '% of the closer pool"><i style="width:' + p + '%"></i><b style="left:' + p + '%"></b></div>';
  }
  var sorted = scores.slice().sort(function (a, b) { return a - b; }), n = sorted.length, BIN = 20;
  var lo = Math.floor(Math.min(sorted[Math.floor(n * 0.03)], r.score) / BIN) * BIN;
  var hi = Math.ceil((Math.max(sorted[Math.floor(n * 0.995)], r.score) + 1) / BIN) * BIN;
  var bins = [], k = Math.max(1, Math.round((hi - lo) / BIN));
  for (var i = 0; i < k; i++) bins.push(0);
  var under = 0, over = 0;
  sorted.forEach(function (v) {
    if (v < lo) { under++; return; }
    if (v >= hi) { over++; return; }
    bins[Math.min(k - 1, Math.floor((v - lo) / BIN))]++;
  });
  var mine = Math.min(k - 1, Math.max(0, Math.floor((r.score - lo) / BIN)));
  var W = 320, H = 150, top = 22, base = 104, bw = W / k, max = Math.max.apply(null, bins) || 1;
  var bars = bins.map(function (c, i) {
    var h = Math.max(2, (c / max) * (base - top));
    return '<rect class="' + (i === mine ? 'you' : 'bar') + '" x="' + (i * bw + 1).toFixed(1) + '" y="' + (base - h).toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"/>';
  }).join('');
  var ticks = '';
  for (var t = Math.ceil(lo / 100) * 100; t < hi; t += 100) ticks += '<text x="' + ((t - lo) / BIN * bw).toFixed(1) + '" y="' + (base + 16) + '" text-anchor="middle">' + t + '</text>';
  var mx = (mine + 0.5) * bw;
  var note = under ? '<text class="note" x="0" y="' + (H - 4) + '">' + under + ' of ' + n + ' closer outings scored lower than the chart shows.</text>' : '';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="your score against the closer pool">' + bars +
    '<text class="you" x="' + Math.max(24, Math.min(W - 24, mx)).toFixed(1) + '" y="14" text-anchor="middle">you, ' + r.score + '</text>' + ticks + note + '</svg>';
}

/* ---- the coach -------------------------------------------------------------------
   Opens only from its button on the result screen (coach.js). */
var TYPE_NAME = { FF: 'four-seam', SI: 'sinker', FC: 'cutter', SL: 'slider', ST: 'sweeper', SV: 'slurve', CU: 'curveball',
  KC: 'knuckle curve', CH: 'changeup', FS: 'splitter', FO: 'forkball', KN: 'knuckleball' };
function typeName(t) { var a = pitchOf(t); return a ? a.name : TYPE_NAME[t] || t; }
function openCoach() {
  var st = S.mode === 'daily' ? S.daily || S.outing : S.outing;
  window.STD_COACH.open({
    scn: S.scn, result: S.result, outing: st, typeName: typeName, batterAt: batterAt,
    outsWords: outsWords, basesWords: basesWords, lastName: lastName,
  });
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
    pbp('practice', 'not scored.');
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
  $('r-coach').addEventListener('click', openCoach);

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
