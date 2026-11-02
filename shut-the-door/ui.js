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
 *   std_ui_v1        settings (sound, quick, meter), and whether the "the
 *                    grade is the decision" line has been shown
 *   std_ui_hist_v1   one row per finished daily (outcome, strip, percentile)
 *                    for the stats sheet and a guest's streak. The outing
 *                    itself is the API's to keep (std_outing_v1), never this
 *                    file's.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT, API = window.STD_API, M = window.STD_MOUND, AN = window.STD_ANIM, MN = window.STD_MENUS;
/* the modes around the daily (modes-ui.js): the save, the vote, Survivor, the archive */
var MU = window.STD_MODES_UI || null;
var METER = window.STD_METER || null;
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
['setScenario', 'setBatter', 'setTarget', 'setPreview', 'layout', 'draw'].forEach(function (n) {
  Pending.prototype[n] = function () { if (this.real) return this.real[n].apply(this.real, arguments); this.calls.push([n, [].slice.call(arguments)]); };
});
Pending.prototype.gridRect = function () {
  if (this.real) return this.real.gridRect();
  var w = this.canvas.clientWidth, h = this.canvas.clientHeight, gw = Math.min(w * 0.6, h * 0.5);
  return { x: (w - gw) / 2, y: h * 0.32, w: gw, h: gw };
};
Pending.prototype.toScreen = function (p) { return this.real ? this.real.toScreen(p) : { x: 0, y: 0 }; };
Pending.prototype.cellCenter = function (c) { return this.real ? this.real.cellCenter(c) : { x: 0, y: 0 }; };
Pending.prototype.previewPoints = function () { return this.real ? this.real.previewPoints() : null; };
Pending.prototype.figureBoxes = function () { return this.real.figureBoxes(); };
Object.defineProperty(Pending.prototype, 'bat', { get: function () { return this.real ? this.real.bat : null; } });
Pending.prototype.play = function (opts) { return this.arrived.then(function (st) { return st.play(opts); }); };

/* ---- what the page keeps ---------------------------------------------------- */

var PREF_KEY = 'std_ui_v1', HIST_KEY = 'std_ui_hist_v1';
function readJSON(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } }
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
var prefs = readJSON(PREF_KEY, {});
if (prefs.sound == null) prefs.sound = true;
/* the release meter is on unless the player turns it off (settings). Off throws an average release. */
if (prefs.meter == null) prefs.meter = true;
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
  day: C.easternDay(), scn: null, dailyScn: null, daily: null, dailyResult: null, arsFor: null, saved: false,
  outing: null, mode: 'daily', type: null, cell: null, at: null, busy: false,
  heat: 'damage', drawer: false, scout: false, guide: null, hover: null, scene: null, grid: null, mini: null, hero: null, result: null,
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
/* each pitch type's own colour, Baseball Savant's (the owner, 2026-10-24: "each pitch type should have
   its own unique color"), so a slider is the same yellow for every pitcher. 3d/preview.js TYPE_COLORS
   is the same map (check-pitches holds them equal). PITCH_COLORS is the fallback for a type not here */
var TYPE_COLORS = { FF: '#d22d49', SI: '#fe9d00', FC: '#933f2c', SL: '#eee716', ST: '#ddb33a', SV: '#93afd4', CU: '#00d1ed', KC: '#6236cd', CS: '#0068ff', CH: '#1dbe3a', FS: '#3bacac', FO: '#55ccab', KN: '#3c44cd', SC: '#60db33', EP: '#888888' };
var PITCH_COLORS = ['#ff4f1f', '#2b59ff', '#8b5cf6', '#14b8a6', '#f2b827', '#ec4899', '#64748b'];
function show(id) {
  /* Survivor and the archive put their own spot on the mound; the home and its links are today's */
  if (id === 's-home' || id === 's-board') dailyBack();
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('on', s.id === id); });
  document.body.dataset.screen = id;
  window.scrollTo(0, 0);
  /* the ads (ads.js): the bottom banner and the rails on the screens that carry them */
  if (window.STD_ADS) STD_ADS.screen(id);
  homeFold();
  if (id === 's-result') { renderModes(); renderStreak(); playResult(); }
}

/* THE BOTTOM BANNER ON THE HOME (ads.js, style.css). At the top of the page no control may sit behind
   the banner, where a tap meant for it would land on the ad. When the home is too tall for the space
   above the banner, the first row of the menu that would sit behind it (today's card once the daily
   is done, Survivor or the links) moves below the fold instead, so the player scrolls to it. Take the
   mound never moves. Measured with offsetTop, so the menu's entrance animation does not move the line. */
function homeFold() {
  var menu = $('h-menu');
  if (!menu) return;
  var rows = [].slice.call(menu.children).filter(function (k) { return k.id !== 'h-go'; });
  rows.forEach(function (k) { k.style.marginTop = ''; });
  var b = document.body;
  if (!b.classList.contains('rtg-sticky-on') || b.dataset.screen !== 's-home') return;
  var ad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-ad-h')) || 0;
  if (!ad) return;
  var vh = window.innerHeight, line = vh - ad;
  for (var i = 0; i < rows.length; i++) {
    var k = rows[i];
    if (k.hidden || !k.offsetHeight) continue;
    var y = 0;
    for (var e = k; e; e = e.offsetParent) y += e.offsetTop;
    if (y >= vh) return;
    if (y + k.offsetHeight > line) { k.style.marginTop = (vh - y + 8) + 'px'; return; }
  }
}
window.addEventListener('rtg-sticky', homeFold);
/* a phone's address bar changes the height as the page scrolls: refold only for a new width or at the top */
var foldW = window.innerWidth;
window.addEventListener('resize', function () {
  if (window.innerWidth !== foldW || !window.scrollY) { foldW = window.innerWidth; homeFold(); }
});
/* the home fills in after the spot loads, so the fold is measured again whenever its column changes size */
function homeFoldWatch() {
  var m = $('h-main');
  if (m && window.ResizeObserver) new ResizeObserver(function () { homeFold(); }).observe(m);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', homeFoldWatch); else homeFoldWatch();

/* back to today's spot after a Survivor run or an archive day */
function dailyBack() {
  if (!S.dailyScn || S.scn === S.dailyScn) return;
  S.scn = S.dailyScn;
  S.mode = 'daily';
  S.outing = S.daily;
  S.result = S.dailyResult;
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
    } else if (name === 'snap') {
      /* the best release: a short bright click, quieter than the glove */
      src = noise(ac, 0.035); f.type = 'highpass'; f.frequency.value = 2600; g.gain.setValueAtTime(0.32, t0);
      var so = ac.createOscillator(), sg = ac.createGain(); so.type = 'triangle'; so.frequency.setValueAtTime(1500, t0); so.frequency.exponentialRampToValueAtTime(900, t0 + 0.06);
      sg.gain.setValueAtTime(0.12, t0); sg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08); so.connect(sg); sg.connect(ac.destination); so.start(t0); so.stop(t0 + 0.1);
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

/* A short name for a few spots, under the matchup on the home screen. Spoiler free: each one says
   what was at stake before the first pitch, never what happened (that is the end screen's). A spot
   with no entry shows the matchup and the occasion only. Sources:
   yamamoto  he started and won Game 6 on October 31, 2025, the night before Game 7 (MLB Stats API,
             2025 World Series schedule and box scores)
   feliz     Texas led the 2011 World Series 3-2 going into Game 6 (MLB Stats API, 2011 World Series)
   pressly   Houston led the 2022 World Series 3-2 going into Game 6 (MLB Stats API, 2022 World Series)
   buehler   Los Angeles led the 2024 World Series 3-1 going into Game 5 (MLB Stats API, 2024 World Series) */
var MOMENT = {
  'std-2025-ws7-yamamoto': 'he started game 6 last night',
  'std-2011-ws6-feliz': 'a win from the title',
  'std-2022-ws6-pressly': 'a win from the title',
  'std-2024-ws5-buehler': 'a win from the title',
};

/* The two clubs: the closer's from the pack (name from the club table, colours from the pack), the
   hitters' from clubs.js (window.STD_BATTING_CLUB, a module that may land after the first render). */
function clubsOf(s) {
  var p = s.pitcher, u = window.STD_CLUB_NAMED ? window.STD_CLUB_NAMED(p.team) : null;
  var parts = String(p.team || '').trim().split(/\s+/);
  var them = window.STD_BATTING_CLUB ? window.STD_BATTING_CLUB({ title: s.title, scenarioId: s.id, pitcher: p }) : null;
  return {
    us: { name: u ? u.nick : parts[parts.length - 1] || 'us', pri: p.teamColors && p.teamColors[0], sec: p.teamColors && p.teamColors[1] },
    them: them ? { name: them.as || them.nick, full: them.city + ' ' + (them.as || them.nick), pri: them.pri, sec: them.sec } : null,
  };
}
function clubStyle(t) {
  if (!t) return '';
  return ' style="' + (t.pri ? '--club:' + esc(t.pri) + ';' : '') + (t.sec ? '--club2:' + esc(t.sec) : '') + '"';
}
/* The occasion: "game 7 \u00b7 2025 world series", or the date of a regular season game ("Dodgers at
   Royals, June 27, 2025" says the clubs already, the matchup line shows them) */
function occasionOf(title) {
  var m = /^(.*?)\s+at\s+(.*?),\s*(.*)$/i.exec(title || '');
  if (m) return m[3].toLowerCase();
  return String(title || '').toLowerCase().split(/,\s*/).join(' \u00b7 ');
}
/* The stakes, from the pack's own setup: "three outs and the door is shut. two runs and it is over." */
function stakesOf(setup) {
  return String(setup || '').split(/\.\s+/).filter(function (x) { return /door is shut|is over/.test(x); })
    .map(function (x) { return x.replace(/\.$/, '') + '.'; }).join(' ');
}

function renderMatchup() {
  var s = S.scn, c = clubsOf(s), sit = s.situation;
  $('h-sit').innerHTML = homeBug(s, c);
  $('h-sit').setAttribute('aria-label', situationLine(sit));
  var due = $('h-due').querySelector('.tw-band');
  if (due) due.setAttribute('style', clubStyle(c.them).replace(/^ style="|"$/g, ''));
}

/* The spot as the mound's scorebug: the two clubs with their colour bars and the score, the inning,
   the bases and the outs. */
function homeBug(s, c) {
  var sit = s.situation, b = sit.bases | 0;
  var team = function (t, n) {
    return '<div class="sb-team"><i class="sb-club"' + clubStyle(t) + '></i><span class="tm">' + esc((t ? t.name : 'them').toUpperCase()) + '</span><b>' + esc(n) + '</b></div>';
  };
  var outs = '';
  for (var i = 0; i < 2; i++) outs += '<i class="' + (i < sit.outs ? 'on' : '') + '"></i>';
  return '<div class="scorebar hb">' +
    '<div class="sb-teams">' + team(c.us, sit.score.us) + team(c.them, sit.score.them) + '</div>' +
    '<div class="sb-innw"><div class="sb-inn"><b>' + (sit.half === 'bottom' ? 'bot' : 'top') + '</b> ' + esc(sit.inning) + '</div>' +
    (sit.walkOffLive ? '<span class="sb-wo">walk-off live</span>' : '') + '</div>' +
    '<svg class="sb-bases" viewBox="0 0 40 30" aria-hidden="true"><path class="sb-path" d="M19.5 6.5 L30.5 17.5 L19.5 28.5 L8.5 17.5 Z"/>' +
    '<rect class="' + (b & 2 ? 'on' : '') + '" x="16" y="3" width="7" height="7" transform="rotate(45 19.5 6.5)"/>' +
    '<rect class="' + (b & 4 ? 'on' : '') + '" x="5" y="14" width="7" height="7" transform="rotate(45 8.5 17.5)"/>' +
    '<rect class="' + (b & 1 ? 'on' : '') + '" x="27" y="14" width="7" height="7" transform="rotate(45 30.5 17.5)"/></svg>' +
    '<div class="sb-stat"><div class="sb-outs">' + outs + '</div><span class="sb-lbl">outs</span></div>' +
    '</div>';
}

/* "R" and the line split into the slash and the homers, when the line has that shape */
function lineParts(line) {
  var m = /^([\d.]+\/[\d.]+\/[\d.]+)(?:,\s*(\d+)\s*HR)?$/.exec(String(line || '').trim());
  return m ? { slash: m[1], hr: m[2] == null ? null : m[2] } : null;
}

function renderHome() {
  var s = S.scn, p = s.pitcher;
  $('h-title').textContent = occasionOf(s.title);
  var mo = MOMENT[s.id];
  $('h-moment').textContent = mo || '';
  $('h-moment').hidden = !mo;
  $('h-setup').innerHTML = '<i class="st-mark" aria-hidden="true"></i><span>' + esc(stakesOf(s.setup) || s.setup) + '</span>';
  var meta = [clubsOf(s).us.name, p.year].filter(Boolean).map(esc).join(' \u00b7 ');
  $('h-pitcher').innerHTML = '<span class="tw-lbl">you pitch as</span><span class="tw-name">' + esc(p.name) + '</span><span class="tw-meta">' + meta + '</span>';
  var bt = s.batters[0], lp = lineParts(bt.line);
  $('h-due').innerHTML = '<i class="tw-band"></i><span class="tw-lbl">due up</span><span class="tw-name">' + esc(bt.name) + '</span>' +
    '<span class="tw-meta">' + (bt.bats ? '<em class="hand">' + esc(bt.bats) + '</em>' : '') + esc(lp ? lp.slash : bt.line || '') + '</span>';
  renderMatchup();
  $('h-proxy').hidden = s.resolution !== 'proxy';
  $('m-proxy').hidden = s.resolution !== 'proxy';
  if (MU) MU.pickLine($('h-pick'), s);
  renderStreak();
  $('h-load').hidden = true;
  $('h-main').hidden = false;
  startHomeBg();
  drawHero();
}

/* The arsenal as a break chart, seen from the pitcher's side: induced vertical
   break up, horizontal break with arm side marked. pfx is catcher's view in
   the data, so x is mirrored, as the grid is. Dots sized by usage. Null when
   the pack has no movement. */
function breakChart(ars, throws, sel) {
  if (!ars.length || ars.some(function (a) { return a.pfxX == null || a.pfxZ == null; })) return '';
  var m = 20;
  ars.forEach(function (a) { m = Math.max(m, Math.abs(a.pfxX) + 3, Math.abs(a.pfxZ) + 3); });
  var c = 74, r = 60, k = r / m;
  /* sel (the pitch guide): that pitch's dot ringed and on top, the rest quieter */
  var dots = ars.map(function (a, i) {
    var x = c - a.pfxX * k, y = c - a.pfxZ * k, rad = 5 + Math.sqrt(a.usage) * 13;
    var on = sel === a.type, op = sel == null || on ? '.92' : '.45';
    var ring = on ? ' stroke="currentColor" stroke-width="2.5"' : '';
    return { on: on, svg: '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rad.toFixed(1) + '" fill="' + (TYPE_COLORS[a.type] || PITCH_COLORS[i % PITCH_COLORS.length]) + '" fill-opacity="' + op + '"' + ring + '><title>' + esc(a.name) + '</title></circle>' };
  }).reverse().sort(function (a, b) { return a.on - b.on; }).map(function (d) { return d.svg; }).join('');
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
  var d = S.daily, r = S.dailyResult, hs = S.dailyScn || S.scn;
  var take = $('b-take');
  if (r) {
    $('h-go').hidden = true;
    $('h-setup').hidden = true;
    var done = $('h-done');
    done.hidden = false;
    var dp = Math.round(r.percentile);
    done.innerHTML =
      '<div class="d-top"><div><p class="dc-lbl">today · #' + esc(hs.number) + '</p><p class="d-out ' + r.outcome + '">' + esc(C.OUTCOME_LABEL[r.outcome]) + '</p></div>' +
      (r.vsReal ? '<span class="vs-pill ' + esc(r.vsReal) + '">' + esc(VS_SHORT[r.vsReal]) + '</span>' : '') + '</div>' +
      '<div class="d-mid"><div class="strip">' + stripHTML(r.strip) + '</div>' +
      '<div class="d-stats"><span><b>' + esc(r.pitches) + '</b> ' + (r.pitches === 1 ? 'pitch' : 'pitches') + '</span>' +
      '<span><b>' + esc(dp) + '<sup>' + ordSuffix(dp) + '</sup></b> of closers</span></div></div>' +
      '<div class="d-act"><button class="btn take sm" type="button" id="d-see">see it again</button>' +
      '<button class="btn dk" type="button" id="d-share">share</button>' +
      '<button class="btn dk" type="button" id="d-again">run it back</button></div>' +
      '<p class="d-tmrw">back tomorrow for #' + esc(hs.number + 1) + '.</p>';
    $('d-share').addEventListener('click', function () { share(r); });
    $('d-see').addEventListener('click', function () { S.mode = 'daily'; S.result = r; renderResult(); show('s-result'); });
    $('d-again').addEventListener('click', practice);
  } else {
    $('h-go').hidden = false;
    $('h-setup').hidden = false;
    $('h-done').hidden = true;
    take.textContent = d && d.pitchNo > 0 ? 'back to the mound · pitch ' + (d.pitchNo + 1) : 'take the mound';
  }
  renderStreak();
  if (MU) MU.homeRow($('h-surv'));
}

/* the home's stadium: the stills, one after another, slowly. CSS does the pan and the fade (transform
   and opacity only). This loads the other three when the page is idle, and holds the clock while the
   tab is hidden. */
function startHomeBg() {
  var bg = $('h-bg');
  if (!bg || bg.dataset.on) return;
  bg.dataset.on = '1';
  var load = function () { bg.querySelectorAll('img[data-src]').forEach(function (im) { im.src = im.dataset.src; im.removeAttribute('data-src'); }); };
  if (window.requestIdleCallback) requestIdleCallback(load, { timeout: 4000 }); else setTimeout(load, 1500);
  document.addEventListener('visibilitychange', function () { bg.classList.toggle('paused', document.hidden); });
}

/* the 3D mound warms up while the player reads the spot (the 2D mound needs no warm) */
function drawHero() {
  if (use3d()) warm3d();
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
  /* the 3D module lands after this: put the aim on its zone then */
  if (S.scene.arrived) S.scene.arrived.then(function (st) { return st.ready; }).then(function () { if (document.body.dataset.screen === 's-mound') relayout(); });
  /* AIM ON THE FIELD (the owner, 2026-10-22): the crosshair on the stage's own zone (aim.js), with
     the heat, the pitch dots and the preview's line in the same box. S.grid keeps its old name: it
     is the aim, the only grid on the mound. A drag or a mouse over it moves the break preview. */
  S.grid = window.STD_AIM.create($('m-scene'), { onPick: pickCell, onHover: hoverCell, label: aimLabel });
  /* the aim sits over the canvas, under the mini map */
  $('m-scene').insertBefore(S.grid.el, $('m-dbg'));
  /* the live field minimap: built into its slot, shown after the first play of the outing */
  S.mini = window.STD_MINIMAP ? window.STD_MINIMAP.create($('m-mini')) : null;
  buildArsenal();
  /* the number keys pick a pitch, on the mound, between pitches */
  document.addEventListener('keydown', function (e) {
    if (document.body.dataset.screen !== 's-mound' || e.ctrlKey || e.metaKey || e.altKey) return;
    /* C challenges the call while the button is up */
    if ((e.key === 'c' || e.key === 'C') && !$('m-abs-b').hidden) { e.preventDefault(); challengeIt(); return; }
    if ((e.key === 'p' || e.key === 'P') && !$('m-run').hidden && !$('m-po').hidden) { e.preventDefault(); pickoffIt(); return; }
    if ((e.key === 'q' || e.key === 'Q') && !$('m-run').hidden) { e.preventDefault(); setSlide(!S.slide); return; }
    if (S.busy) return;
    if (S.meter && S.meter.running()) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, .sheet')) return;
    var k = /^[1-9]$/.test(e.key) ? +e.key - 1 : -1, a = S.scn.pitcher.arsenal[k];
    if (!a) return;
    e.preventDefault();
    pickType(a.type);
  });
  wireMound();
}
/* The pitch buttons for the spot's closer. Built with the mound, and again when Survivor or the
   archive puts a different closer on it. */
function buildArsenal() {
  S.arsFor = S.scn.id;
  var ars = $('m-arsenal');
  ars.innerHTML = '';
  ars.dataset.n = S.scn.pitcher.arsenal.length;
  var big = maxBreak(S.scn.pitcher.arsenal);
  /* BIG PITCH BUTTONS (the owner, 2026-10-22): each one its number, its name, its speed range and
     its break glyph. The exact speed of a pitch is revealed after the throw (the owner, 2026-10-23);
     the range is what his arm can do with it (the owner, 2026-10-26), see speedOf. The number is the
     key that picks it. */
  S.scn.pitcher.arsenal.forEach(function (a, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pitch';
    b.dataset.type = a.type;
    /* the pitch's own colour: a bar down the button's edge and the picked state */
    b.style.setProperty('--pc', colorOf(a));
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', (i + 1) + ', ' + a.name);
    b.innerHTML = '<span class="pk" aria-hidden="true">' + (i + 1) + '</span><span class="pt" aria-hidden="true"><b>' + esc(a.name) + '</b>' +
      '<span class="ps"></span><span class="pv">' + breakGlyph(a, colorOf(a), big) + '</span></span>';
    var held = holdToLearn(b, a.type);
    b.addEventListener('click', function () { if (!held()) pickType(a.type); });
    ars.appendChild(b);
  });
  fitNames();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNames);
}
/* the mound's own controls, wired once */
function wireMound() {
  $('m-throw').addEventListener('click', throwIt);
  $('m-abs-b').addEventListener('click', challengeIt);
  $('m-po').addEventListener('click', pickoffIt);
  $('m-quick').addEventListener('click', function () { setSlide(!S.slide); });
  /* the meter on the page is meter-ui.js (the look); meter.js keeps the numbers */
  S.meter = METER && $('m-meter') ? (window.STD_METER_UI || METER).create($('m-meter')) : null;
  /* the speed ranges read the meter setting, so they go on once the meter is built */
  speedLabels();
  $('m-drawer-b').addEventListener('click', function () { if (S.drawer) closeDrawer(); else openDrawer(); });
  $('m-batter').addEventListener('click', toggleScout);
  /* a tap outside closes the drawer. Outside is the scene, the scorebug, the menu. The zone and the
     dock are play, so aiming and picking a pitch keep the heat up; the sheets the drawer opened are
     part of it. */
  document.addEventListener('pointerdown', function (e) {
    if (!S.drawer || document.body.dataset.screen !== 's-mound') return;
    var t = e.target;
    if (t && t.closest && t.closest('#m-card, #m-scout, #m-guide, #m-aim, #m-dock')) return;
    closeDrawer();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.drawer && document.body.dataset.screen === 's-mound') closeDrawer();
  });
  $('m-guide-b').addEventListener('click', function () { setGuide(S.guide ? null : S.type || S.scn.pitcher.arsenal[0].type); });
  $('m-guide').addEventListener('click', function (e) {
    if (e.target.closest('.gd-x')) setGuide(null);
  });
  /* the pitch dot key: small, behind its own toggle on the batter card */
  $('m-key-b').addEventListener('click', function () {
    var on = $('m-key').hidden;
    $('m-key').hidden = !on;
    this.setAttribute('aria-expanded', on ? 'true' : 'false');
    placeHud();
  });
  $('m-heat').addEventListener('click', function (e) {
    var x = e.target.closest('[data-heat]');
    if (!x) return;
    S.heat = x.dataset.heat;
    renderScout();
  });
  /* FULL SCREEN (the owner, 2026-10-24): the canvas is the viewport, so a turn of the phone, a
     resize and the browser's bars coming and going all lay the stage and the aim out again */
  /* the stage frames around the lasting panels (stage.js framePanels), so a new layout shuts the
     scout drawer first: the set is framed for the slim line, never for the drawer */
  var onSize = function () { if (document.body.dataset.screen !== 's-mound') return; if (S.busy) S.sizeDue = true; else { if (S.drawer) closeDrawer(true); relayout(); } };
  window.addEventListener('resize', onSize);
  window.addEventListener('orientationchange', function () { onSize(); setTimeout(onSize, 250); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onSize);
  /* The scene's box moves without a window resize (a line wraps, a button grows): the canvas then
     shows a stretched frame and the grid sits off the zone, so lay out again. Never mid pitch. */
  if (window.ResizeObserver) {
    var seen = '';
    new ResizeObserver(function () {
      var c = $('m-canvas'), k = c.clientWidth + 'x' + c.clientHeight;
      if (k === seen || !c.clientWidth || document.body.dataset.screen !== 's-mound') return;
      seen = k;
      if (S.busy) S.sizeDue = true; else relayout();
    }).observe($('m-canvas'));
  }
}

/* A pitch's name on its button, whole: five in a row are narrow (curveball, four-seam), so a name
   that does not fit steps down half a pixel at a time, never under 12 px, before it would cut. */
/* The speed range on a pitch button: the slowest and the fastest the power stop can make of that
   pitch (meter.js veloOf at e 0 and e 1, his own real speeds), whole mph. With the meter off there is
   no power stop and the engine plays his ordinary pitch, so it is that one speed. */
function speedOf(a) {
  var one = function (v) { return v != null && isFinite(v) ? Math.round(v) : null; };
  if (!(METER && METER.POWER === true && typeof METER.veloOf === 'function' && meterOn())) {
    var v = METER && typeof METER.veloOf === 'function' ? one(METER.veloOf(a)) : one(a.velo);
    return v == null ? '' : v + ' mph';
  }
  var lo = one(METER.veloOf(a, 0)), hi = one(METER.veloOf(a, 1));
  if (lo == null || hi == null) return '';
  if (lo > hi) { var t = lo; lo = hi; hi = t; }
  return (lo === hi ? lo : lo + '-' + hi) + ' mph';
}
function speedLabels() {
  if (!S.scn) return;
  var ars = S.scn.pitcher.arsenal;
  document.querySelectorAll('#m-arsenal .pitch').forEach(function (b, i) {
    var a = ars[i], ps = b.querySelector('.ps');
    if (!a || !ps) return;
    var txt = speedOf(a);
    /* the unit a size down, so the two numbers carry the button */
    ps.innerHTML = txt ? esc(txt.replace(/ mph$/, '')) + '<small>mph</small>' : '';
    b.setAttribute('aria-label', (i + 1) + ', ' + a.name + (txt ? ', ' + txt : ''));
  });
}
function fitNames() {
  document.querySelectorAll('#m-arsenal .pt b').forEach(function (b) {
    b.style.fontSize = '';
    var cs = getComputedStyle(b), px = parseFloat(cs.fontSize) || 16;
    var room = b.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 1;
    if (room <= 0) return;
    /* the text's own width (an italic overhangs its box by a pixel or two) */
    var r = document.createRange();
    r.selectNodeContents(b);
    while (r.getBoundingClientRect().width > room && px > 12) { px -= 0.5; b.style.fontSize = px + 'px'; }
  });
}
function relayout() {
  fitNames();
  S.scene.layout();
  S.grid.place(S.scene.gridRect());
  S.scene.draw(idleFrame());
  drawPreview();
  placeHud();
  renderGuide();
}
/* The HUD over the full screen scene: where the top left column ends (the minimap hangs under it),
   and the open sheet placed off the zone. */
/* the corner layout (style.css THE CORNER LAYOUT): sideways, or upright with room for corners */
var WIDE_HUD = '(orientation: landscape), (min-width: 700px) and (min-height: 600px)';
function wideHud() { return !!(window.matchMedia && matchMedia(WIDE_HUD).matches); }
function placeHud() {
  var host = $('s-mound'), tl = host.querySelector('.mh-tl');
  if (!tl || !host.classList.contains('on')) return;
  var hb = host.getBoundingClientRect();
  host.style.setProperty('--hud-top', Math.round(tl.getBoundingClientRect().bottom - hb.top) + 'px');
  placeSheet($('m-scout'), 'scout');
  placeSheet($('m-guide'), 'guide');
}
/* A sheet over the scene, never over the zone. Sideways: in the left column under the batter card.
   Upright: the scout card from the bottom up to just under the zone (over the dock, as it always sat
   over the pitch buttons); the guide between the batter card and the zone when it fits, else the same. */
function placeSheet(box, kind) {
  if (!box || box.hidden || !S.grid) return;
  var hb = $('s-mound').getBoundingClientRect(), g = S.grid.el.getBoundingClientRect();
  var card = $('s-mound').querySelector('.mh-tl').getBoundingClientRect();
  var gut = parseFloat(getComputedStyle($('s-mound')).getPropertyValue('--gut')) || 12;
  var top = Math.round(card.bottom - hb.top + 8);
  box.classList.remove('top', 'low');
  box.style.top = ''; box.style.maxHeight = '';
  if (wideHud()) {
    box.classList.add('top');
    box.style.top = top + 'px';
    box.style.maxHeight = Math.max(120, hb.height - top - gut) + 'px';
    return;
  }
  var above = Math.round(g.top - hb.top - 8 - top);
  if (kind === 'guide' && above >= 118) { box.style.top = top + 'px'; box.style.maxHeight = above + 'px'; return; }
  box.classList.add('low');
  box.style.maxHeight = Math.max(120, Math.round(hb.bottom - g.bottom - 8 - gut)) + 'px';
}
function idleFrame() {
  return { pitcher: 'set', batter: 'stance', umpire: 'set', mitt: S.cell != null ? aimPoint(S.cell, S.at) : null, marker: S.lastMarker || null };
}
/* FREE AIM: the exact point on screen for a cell and its at (catcher's view fractions of the cell),
   through the scene's own projection. The 2D drawing's mitt sets up there. */
function aimPoint(cell, at) {
  var t = C.targetOf(cell);
  if (!at) return S.scene.cellCenter(cell);
  return S.scene.toScreen({ x: t.x + at[0] * C.GRID.COL_FT, zn: t.zn + at[1] * C.GRID.ROW_ZN });
}

function enterMound() {
  buildMound();
  /* a different closer (Survivor's next spot, an archive day): his own pitch buttons */
  if (S.arsFor !== S.scn.id) { buildArsenal(); speedLabels(); S.grid.setMarks({}); }
  $('m-proxy').hidden = S.scn.resolution !== 'proxy';
  stopMeter(); meterDone();
  S.scene.setScenario(S.scn);
  S.type = null; S.cell = null; S.at = null; S.lastMarker = null; S.paintedN = null;
  clearTimeout(S.endWinT); S.endWin = null; S.absBusy = false;
  if (S.mini) S.mini.reset();
  show('s-mound');
  setBatter(true);
  renderHud(S.outing);
  if (S.outing.pitchNo === 0) pbp('', batterAt(S.outing.batterIndex).name + ' leads off.');
  else pbp(isTied(S.outing) ? 'tied' : '', 'pitch ' + (S.outing.pitchNo + 1) + '. ' + batterAt(S.outing.batterIndex).name + ' up.');
  updateThrow();
  if (DEBUG) { $('m-dbg').hidden = false; $('m-dbg').textContent = 'seed ' + S.outing.seed + ' · ' + S.outing.mode; }
}

function setBatter(first) {
  var b = batterAt(S.outing.batterIndex);
  /* every at bat starts with the drawer shut (the owner, 2026-10-27), before the stage frames the
     new hitter around the lasting panels (stage.js framePanels) */
  closeDrawer(true);
  S.scene.setBatter(b);
  S.grid.setHand(b.bats);
  $('m-bname').textContent = b.name;
  $('m-bhand').textContent = 'bats ' + (b.bats === 'L' ? 'L' : 'R');
  $('m-bhand').setAttribute('aria-label', 'bats ' + handWord(b.bats));
  /* the slash line and the homers, as the pack writes them */
  var lp = lineParts(b.line);
  $('m-bline').textContent = lp ? lp.slash + (lp.hr != null ? ' \u00b7 ' + lp.hr + ' HR' : '') : (b.line || '');
  relayout();
  renderScout();
  if (!first) pbp(isTied(S.outing) ? 'tied' : '', b.name + ' up.', true);
}

/* A run that ties does not end the outing (the owner's call, 2026-10-20). Once
   it is tied the scorebar says so and every new batter's line is tagged TIED,
   until three outs hold it or they go ahead. No popup. */
function isTied(st) { return !!(st && st.score && st.score.us === st.score.them); }

/* the closer's club, from the scenario's own colours. Without them the bar is the grey default. */
function setClub(el, colors) {
  if (colors && colors[0]) el.style.setProperty('--club', colors[0]); else el.style.removeProperty('--club');
  if (colors && colors[1]) el.style.setProperty('--club2', colors[1]); else el.style.removeProperty('--club2');
}
function renderHud(st) {
  /* rules 8: the half being pitched (st.half), else the spot's own inning */
  var sit = st && st.half && st.half.inning ? st.half : S.scn.situation;
  setClub($('m-usclub'), S.scn.pitcher.teamColors);
  // the hitters' club, from the same rule the 3D kit uses (clubs.js, loaded by index.html); grey until it is
  var them = window.STD_BATTING_CLUB ? window.STD_BATTING_CLUB({ title: S.scn.title, scenarioId: S.scn.id, pitcher: S.scn.pitcher }) : null;
  setClub($('m-themclub'), them ? [them.pri, them.sec] : null);
  var usName = closerName(S.scn.pitcher), themName = them ? (them.as || them.nick) : '';
  $('m-usname').textContent = usName || 'us';
  $('m-themname').textContent = themName ? themName.toUpperCase() : 'them';
  $('m-usname').title = usName ? S.scn.pitcher.team : '';
  $('m-themname').title = them ? (them.city + ' ' + them.nick) : '';
  renderPAs(st);
  $('m-us').textContent = st.score.us;
  $('m-them').textContent = st.score.them;
  var tied = isTied(st);
  $('m-inn').innerHTML = '<b>' + (sit.half === 'bottom' ? 'bot' : 'top') + '</b> ' + sit.inning + (tied ? '<i class="sb-tied">tied</i>' : '');
  var bar = $('m-inn').closest('.scorebar');
  bar.classList.toggle('tied', tied);
  bar.setAttribute('aria-label', tied ? 'Scoreboard, tied ' + st.score.us + '-' + st.score.them : 'Scoreboard');
  var cnt = $('m-count');
  var row = function (letter, n, max) {
    var h = '<span class="row"><em>' + letter + '</em>';
    for (var i = 0; i < max; i++) h += '<i class="' + (i < n ? 'on' : '') + '"></i>';
    return h + '</span>';
  };
  cnt.innerHTML = row('B', st.count.b, 3) + row('S', st.count.s, 2);
  cnt.setAttribute('aria-label', st.count.b + ' balls, ' + st.count.s + ' strikes');
  $('m-pn').textContent = st.status === 'live' ? st.pitchNo + 1 : st.pitchNo;
  var bs = $('m-bases');
  bs.querySelector('.b1').classList.toggle('on', !!(st.bases & 1));
  bs.querySelector('.b2').classList.toggle('on', !!(st.bases & 2));
  bs.querySelector('.b3').classList.toggle('on', !!(st.bases & 4));
  var outs = $('m-outs').children;
  for (var i = 0; i < outs.length; i++) outs[i].classList.toggle('on', i < st.outs);
  renderAbs(st);
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
  stopMeter();
  S.type = t;
  document.querySelectorAll('#m-arsenal .pitch').forEach(function (b) {
    var on = b.dataset.type === t; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (S.guide) setGuide(t);
  drawPreview();
  updateThrow();
}
/* a drag over the zone, or a mouse over it: the preview follows, nothing is picked yet. A drag
   reports every move, so the preview is drawn once a frame at most. */
function hoverCell(c, at) {
  if (S.busy) return;
  S.hover = c;
  S.hoverAt = c == null ? null : at || null;
  if (S.hoverRaf) return;
  S.hoverRaf = requestAnimationFrame(function () { S.hoverRaf = 0; drawPreview(); });
}
/* the tag over the crosshair: the spot in inside and away words, and the heat's number there */
function aimLabel(c) {
  var bt = batterAt(S.outing.batterIndex), v = S.grid.heatOf(c);
  return M.cellWords(c, bt.bats) + (v ? ' \u00b7 ' + v : '');
}
function pickCell(c, at) {
  if (S.busy) return;
  S.hover = null; S.hoverAt = null;
  stopMeter();
  S.cell = c;
  S.at = at || [0, 0];
  S.grid.setSelected(c, S.at);
  S.lastMarker = null;
  S.grid.setMarks({});
  /* the stage takes (cell) today; at is for the stage hook that aims the catcher at the exact point */
  if (S.scene.setTarget) S.scene.setTarget(c, S.at);
  S.scene.draw(idleFrame());
  drawPreview();
  updateThrow();
}
/* ONE CLEAR THROW BUTTON (the owner, 2026-10-22). It always says throw; it lights up when a pitch
   and a spot are picked, and says which under the word. What to do next is the step line's job. */
function updateThrow() {
  var b = $('m-throw'), bt = batterAt(S.outing.batterIndex);
  var ready = S.type && S.cell != null && !S.busy;
  b.disabled = !ready;
  b.classList.toggle('shut', !!(ready && S.outing.shutItLive));
  if (S.busy) b.innerHTML = '<b>pitching</b>';
  else b.innerHTML = '<b>throw</b>' + (ready ? '<span>' + esc(pitchOf(S.type).name) + ' \u00b7 ' + esc(M.cellWords(S.cell, bt.bats)) + '</span>' : '');
  stepLine();
  absButton();
  runBar();
}
/* THE STEP LINE (the owner, 2026-10-22): one short line under the throw button and the release
   meter, saying the next thing to do. It never grades and is empty while the pitch plays. */
function stepLine() {
  var el = $('m-say');
  if (!el) return;
  var say = '';
  if (S.busy || !S.outing || S.outing.status !== 'live') say = '';
  /* the meter says its own tap on the panel itself (meter-ui.js, the cue: the owner, 2026-10-30), so
     the line over it stays empty: one message, on the thing to tap */
  else if (S.meter && S.meter.running()) say = '';
  else if (!S.type) say = 'pick a pitch';
  else if (S.cell == null) say = 'aim: drag or tap the zone';
  else say = 'tap throw';
  if (el.textContent !== say) el.textContent = say;
}

/* THE SCOUT DRAWER (the owner, 2026-10-27: "minimal clutter on the gameplay"). The at bat line
   stays one slim row; SCOUT opens the rest under it. The heat map shows only while it is open, so
   the field is clear by default and the scouting is one tap away. Only a tap opens it. */
function openDrawer() {
  if (S.drawer) return;
  S.drawer = true;
  $('m-drawer').hidden = false;
  drawerState();
}
/* quiet: on a new at bat, before the layout runs anyway */
function closeDrawer(quiet) {
  var was = S.drawer || S.scout || S.guide || S.viewPA || !$('m-key').hidden, hadView = !!S.viewPA;
  S.drawer = false;
  S.scout = false;
  S.viewPA = null;
  $('m-drawer').hidden = true;
  $('m-key').hidden = true;
  $('m-key-b').setAttribute('aria-expanded', 'false');
  if (S.guide) setGuide(null);
  if (!was) return;
  drawerState();
  /* an earlier at bat on the zone goes back to this one's dots */
  if ((hadView || !quiet) && S.outing) renderPAs(S.outing);
}
function drawerState() {
  $('m-drawer-b').setAttribute('aria-expanded', S.drawer ? 'true' : 'false');
  $('m-card').classList.toggle('open', !!S.drawer);
  if (S.outing && S.grid) renderScout();
  placeHud();
}

function toggleScout() {
  S.scout = !S.scout;
  if (S.scout && S.guide) setGuide(null);
  renderScout();
}

/* The heat map is on the grid only while the scout drawer is open (S.heat is its mode); the
   report is the reading of the hitter, opened from the drawer. It is a sheet over the lower HUD,
   under the grid. */
function renderScout() {
  var b = batterAt(S.outing.batterIndex), box = $('m-scout');
  /* rules 2: the screen reads the scouting view (grade.js scoutView: the chase area in four quadrants,
     values in steps), never the exact profile the engine plays */
  var G = window.STD_GRADE, view = G && G.scoutView && S.outing.rules >= 2 ? G.scoutView(b.profile) : b.profile;
  S.grid.setHeat(S.drawer ? view : null, S.heat);
  $('m-batter').setAttribute('aria-expanded', S.scout ? 'true' : 'false');
  $('m-batter').classList.toggle('on', !!S.scout);
  document.querySelectorAll('#m-heat [data-heat]').forEach(function (x) {
    x.setAttribute('aria-selected', x.dataset.heat === S.heat ? 'true' : 'false');
  });
  var H = M.HEAT[S.heat];
  $('m-heat-legend').innerHTML = '<i class="lo"></i>' + esc(H.fmt(H.lo)) + '<i class="hi"></i>' + esc(H.fmt(H.hi));
  if (!S.scout) { box.hidden = true; return; }
  box.innerHTML = scoutCard(b, view);
  box.hidden = false;
  /* a sheet over the scene that stops short of the zone, so the zone is never covered */
  placeSheet(box, 'scout');
}

/* The card: one sentence, the hitter's rates as bars, and his line against each pitch of the
   closer's arsenal. Built only from the profile and the arsenal. A field the data does not have
   is left out, never shown as zero. The league marker draws only if the profile carries a league
   value (no pack does yet). */
function scoutCard(b, view) {
  var pr = view || b.profile, lg = pr.league || {};
  var rows = S.scn.pitcher.arsenal.map(function (a) {
    var w = pr.whiff ? pr.whiff[a.type] : null, l = lg.whiff ? lg.whiff[a.type] : null;
    return { name: a.name, usage: a.usage, whiff: w == null ? null : w, lg: l == null ? null : l };
  });
  var bars = '';
  if (pr.zoneSwing != null) bars += barRow('zone swing', pr.zoneSwing, lg.zoneSwing);
  if (pr.chase != null) bars += barRow('chase', pr.chase, lg.chase);
  var table = rows.map(function (r) {
    return '<div class="pr"><span class="pn">' + esc(r.name) + '</span>' +
      '<span class="cell">' + track(r.usage, null, 'mx') + '<b>' + pct(r.usage) + '</b></span>' +
      '<span class="cell">' + (r.whiff != null ? track(r.whiff, r.lg, 'wh') + '<b>' + pct(r.whiff) + '</b>' : '') + '</span></div>';
  }).join('');
  var note = b.profileTier !== 'batter' ? '<p class="sc-note">profile from ' + (b.profileTier === 'similar' ? 'similar hitters' : 'the league') + '</p>' : '';
  return '<p class="sc-say">' + esc(scoutSentence(pr, rows)) + '</p>' +
    (bars ? '<div class="sc-bars">' + bars + '</div>' : '') +
    '<div class="sc-pitches"><div class="pr hd"><span class="pn"></span><span class="cell">mix</span><span class="cell">whiffs</span></div>' + table + '</div>' + note;
}
function barRow(label, v, lgv) {
  return '<div class="bar"><span class="bl">' + esc(label) + '</span>' + track(v, lgv, 'bt') + '<b>' + pct(v) + '</b></div>';
}
/* a 0-100% track: the fill is the rate, a thin tick is the league's rate when there is one */
function track(v, lgv, cls) {
  var w = Math.max(0, Math.min(1, v)) * 100;
  return '<span class="trk ' + cls + '"><i style="width:' + w.toFixed(1) + '%"></i>' +
    (lgv != null ? '<em style="left:' + (Math.max(0, Math.min(1, lgv)) * 100).toFixed(1) + '%" title="league ' + pct(lgv) + '"></em>' : '') + '</span>';
}
/* one sentence from the hitter's own numbers; the whiff clause needs two pitches to compare */
function scoutSentence(pr, rows) {
  var parts = [];
  if (pr.zoneSwing != null) parts.push('swings at ' + pct(pr.zoneSwing) + ' in the zone');
  if (pr.chase != null) parts.push('chases ' + pct(pr.chase) + ' out');
  var seen = rows.filter(function (r) { return r.whiff != null; });
  if (seen.length >= 2) {
    var worst = seen.reduce(function (m, r) { return r.whiff > m.whiff ? r : m; });
    parts.push('misses the ' + worst.name + ' most');
  }
  if (!parts.length) return '';
  var s = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + (parts.length === 2 ? ' and ' : ', and ') + parts[parts.length - 1];
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

/* ---- what each pitch does ---------------------------------------------------------------
   The break preview (the animated indicator the 3D stage draws from the hand to the spot; the thin
   line on the grid only without WebGL), the glyph on each pitch button and the pitch guide. All of it
   comes from the arsenal's own numbers: velo, pfxX and pfxZ (catcher's view inches, so mirrored on
   screen like the grid), usage, and the shape from the contract. The preview is the aim, never
   the outcome: it ends on the exact aim point, wherever the engine's command draw puts the ball. */

/* the colour a pitch has everywhere (its type's, else its place by usage), so the buttons, the chart,
   the guide and the reticle agree */
function colorOf(a) {
  if (TYPE_COLORS[a.type]) return TYPE_COLORS[a.type];
  var ord = S.scn.pitcher.arsenal.slice().sort(function (x, y) { return y.usage - x.usage; });
  return PITCH_COLORS[Math.max(0, ord.indexOf(a)) % PITCH_COLORS.length];
}
function maxBreak(ars) {
  var m = 10;
  ars.forEach(function (a) { if (a.pfxX != null && a.pfxZ != null) m = Math.max(m, Math.sqrt(a.pfxX * a.pfxX + a.pfxZ * a.pfxZ)); });
  return m;
}
/* A tiny arrow: the way the pitch breaks from the pitcher's side (x mirrored, up is up), its
   length the size of the break against his biggest. */
function breakGlyph(a, color, big) {
  if (a.pfxX == null || a.pfxZ == null) return '';
  var mag = Math.sqrt(a.pfxX * a.pfxX + a.pfxZ * a.pfxZ), L = mag < 3 ? 0 : 3 + 3.5 * mag / big;
  var ex = -a.pfxX / (mag || 1) * L, ey = -a.pfxZ / (mag || 1) * L;
  if (L < 0.5) return '<svg class="glyph" viewBox="-8 -8 16 16" aria-hidden="true"><circle r="3.4" fill="' + color + '"/></svg>';
  var ux = ex / L, uy = ey / L, f = function (v) { return v.toFixed(1); };
  var hx = ex - ux * 3.4, hy = ey - uy * 3.4;
  return '<svg class="glyph" viewBox="-8 -8 16 16" aria-hidden="true"><circle r="1.6" fill="' + color + '" fill-opacity=".55"/>' +
    '<path d="M0 0L' + f(hx) + ' ' + f(hy) + '" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M' + f(ex) + ' ' + f(ey) + 'L' + f(hx - uy * 2.6) + ' ' + f(hy + ux * 2.6) + 'L' + f(hx + uy * 2.6) + ' ' + f(hy - ux * 2.6) + 'Z" fill="' + color + '"/></svg>';
}

/* A long press on a pitch button opens its guide (and does not pick it). Returns a test for the
   click that follows a long press, so that click is not a pick. */
function holdToLearn(b, type) {
  var t = null, at = -1e9;
  var now = function () { return window.performance ? performance.now() : Date.now(); };
  b.addEventListener('pointerdown', function (e) {
    if (e.button > 0 || S.busy) return;
    clearTimeout(t);
    t = setTimeout(function () { at = now(); setGuide(type); }, 450);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, function () { clearTimeout(t); }); });
  b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  return function () { return now() - at < 900; };
}

/* The preview: with a pitch picked, its path to the hovered cell, the picked cell, or the middle
   of the zone before a cell is picked. Gone while a pitch is in the air. */
function drawPreview() {
  if (!S.grid || !S.scene) return;
  var hov = S.hover != null, cell = hov ? S.hover : S.cell, at = hov ? S.hoverAt : S.at;
  var live = S.type && !S.busy && S.outing && S.outing.status === 'live';
  /* at rides on the spec, so the stage ends the ghost on the exact point */
  var spec = live ? (cell == null ? { type: S.type, cell: 12 } : { type: S.type, cell: cell, at: at || [0, 0] }) : null;
  if (S.scene.setPreview) S.scene.setPreview(spec);
  var svg = gridLine();
  /* the 3D stage draws its own animated indicator; this 2D line is only for the no WebGL drawing */
  if (S.scene.is3d) { svg.style.display = 'none'; return; }
  var pp = spec && S.scene.previewPoints ? S.scene.previewPoints() : null;
  if (!pp || pp.path.length < 2) { svg.style.display = 'none'; return; }
  var r = S.scene.gridRect();
  var line = function (pts) { return pts.map(function (q, i) { return (i ? 'L' : 'M') + (q.x - r.x).toFixed(1) + ' ' + (q.y - r.y).toFixed(1); }).join(''); };
  var end = function (el, pts) { var e = pts[pts.length - 1]; el.setAttribute('cx', (e.x - r.x).toFixed(1)); el.setAttribute('cy', (e.y - r.y).toFixed(1)); };
  svg.setAttribute('viewBox', '0 0 ' + r.w.toFixed(1) + ' ' + r.h.toFixed(1));
  var d = line(pp.path);
  svg.querySelector('.gp-rim').setAttribute('d', d);
  svg.querySelector('.gp-core').setAttribute('d', d);
  end(svg.querySelector('.gp-end'), pp.path);
  var hasRef = pp.ref && pp.ref.length > 1;
  svg.querySelector('.gp-ref').setAttribute('d', hasRef ? line(pp.ref) : '');
  if (hasRef) end(svg.querySelector('.gp-refend'), pp.ref);
  svg.querySelector('.gp-refend').style.display = hasRef ? '' : 'none';
  svg.style.display = '';
}
function gridLine() {
  var svg = S.grid.el.querySelector('.gpath');
  if (svg) return svg;
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'gpath');
  svg.setAttribute('aria-hidden', 'true');
  /* the no spin line under the path: the gap between their ends is the break */
  svg.innerHTML = '<path class="gp-ref"/><circle class="gp-refend" r="3.5"/><path class="gp-rim"/><path class="gp-core"/><circle class="gp-end" r="3"/>';
  S.grid.el.appendChild(svg);
  return svg;
}

/* What the pitch does, in a line, from its shape (the contract's SHAPE_OF) and its numbers.
   Sideways is said for this hitter: in on him or away from him, from his hand (a righty stands
   on the catcher's left, the negative pfxX side). */
function pitchSay(a, bats) {
  if (a.pfxX == null || a.pfxZ == null) return '';
  var x = a.pfxX, z = a.pfxZ, ax = Math.abs(x), shape = a.shape || C.SHAPE_OF[a.type];
  var toward = bats === 'L' ? x > 0 : x < 0;
  var dir = (toward ? 'in on ' : 'away from ') + (bats === 'L' ? 'a lefty' : 'a righty');
  var side = function (verb, min) { return ax >= min ? ' ' + verb + ' ' + dir + '.' : ''; };
  switch (shape) {
    case 'ride': return (z >= 15 ? 'Rises.' : 'Stays up.') + side('Tails', 6);
    case 'run': return 'Sinks and runs ' + dir + '.';
    case 'cut': return ax >= 3 ? 'Cuts ' + dir + ' late.' : 'Stays up. Cuts late.';
    case 'slide': return 'Slides ' + dir + '.' + (z <= 2 ? ' Drops some.' : '');
    case 'sweep': return 'Sweeps ' + dir + '.';
    case 'drop': return (z <= -12 ? 'Drops hard.' : 'Drops.') + side('Breaks', 8);
    case 'fade': return 'Fades ' + dir + '.' + (z <= 6 ? ' Dies late.' : '');
    case 'split': return (z <= 3 ? 'Drops hard late.' : 'Drops late.') + side('Fades', 8);
    case 'float': return 'Floats. No spin, no plan.';
  }
  return '';
}

/* The pitch guide: a small sheet over the top of the field (the stands, above the grid), opened
   only by its button or a long press on a pitch, never by itself. It blocks nothing: the grid and
   the buttons stay live, and picking a pitch turns the guide to it. */
function setGuide(type) {
  S.guide = type || null;
  if (S.guide && S.scout) { S.scout = false; renderScout(); }
  $('m-guide-b').setAttribute('aria-expanded', S.guide ? 'true' : 'false');
  $('m-guide-b').classList.toggle('on', !!S.guide);
  renderGuide();
}
function renderGuide() {
  var box = $('m-guide');
  if (!box) return;
  var a = S.guide && pitchOf(S.guide);
  if (!a || !S.outing) { box.hidden = true; return; }
  var b = batterAt(S.outing.batterIndex), p = S.scn.pitcher, lefty = b.bats === 'L';
  var ordered = p.arsenal.slice().sort(function (x, y) { return y.usage - x.usage; });
  var chart = breakChart(ordered, p.throws, a.type);
  /* no speed: it is revealed after the throw (the owner, 2026-10-23) */
  var nums = '';
  if (a.pfxX != null && a.pfxZ != null) {
    var toward = lefty ? a.pfxX > 0 : a.pfxX < 0, hx = Math.round(Math.abs(a.pfxX));
    nums += '<span><b>' + esc(Math.round(Math.abs(a.pfxZ))) + '"</b>' + (a.pfxZ >= 0 ? 'up' : 'down') + '</span>' +
      '<span><b>' + esc(hx) + '"</b>' + (hx === 0 ? 'sideways' : toward ? 'in' : 'away') + '</span>';
  }
  nums += '<span><b>' + esc(pct(a.usage)) + '</b>thrown</span>';
  box.innerHTML = '<div class="gd-head"><i class="dot" style="background:' + colorOf(a) + '"></i><b>' + esc(a.name) + '</b>' +
    '<span>vs ' + (lefty ? 'a lefty' : 'a righty') + '</span><button class="gd-x" type="button" aria-label="Close the pitch guide">\u00d7</button></div>' +
    '<div class="gd-body">' + (chart ? '<div class="brk gd-brk">' + chart + '</div>' : '') +
    '<div class="gd-txt"><p class="gd-say">' + esc(pitchSay(a, b.bats)) + '</p><div class="gd-nums">' + nums + '</div>' +
    '<p class="gd-foot">inches of break against no spin (the dotted line).</p></div></div>';
  box.hidden = false;
  placeSheet(box, 'guide');
}

/* the closer's club in capitals, from the club table: the nickname, or the last word of a name
   the table does not know (never the city) */
function closerName(p) {
  var c = window.STD_CLUB_NAMED ? window.STD_CLUB_NAMED(p.team) : null;
  if (c) return c.nick.toUpperCase();
  var parts = String(p.team || '').trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
}
/* the first pitch to the hitter now up: the pitches before it are the outing's, the rest his */
function paStart(log) {
  for (var i = log.length - 1; i >= 0; i--) if (log[i].paOver) return i + 1;
  return 0;
}

/* The zone's dots are the at bat you are in, and only it (the owner, 2026-10-24). Each finished at bat
   is a chip on the batter card (his name and how it ended); a tap shows that at bat's pitches on the
   zone, a second tap or the next pitch goes back to the at bat you are in. */
function finishedPAs(log) {
  var out = [], start = 0, bi = 0;
  (log || []).forEach(function (pr, i) {
    if (!pr.paOver) return;
    var b = batterAt(bi);
    out.push({ from: start, to: i + 1, name: lastName(b.name), word: playText(pr, b).tag, abs: log.slice(start, i + 1).some(overturned) });
    start = i + 1; bi++;
  });
  return out;
}
function renderPAs(st) {
  var log = st.log || [], box = $('m-pas');
  if (S.viewPA && S.viewPA.n !== log.length) S.viewPA = null;
  var v = S.viewPA;
  S.grid.setPitches(log, v ? v.from : paStart(log), v ? v.to : null);
  markAbsDots(log, v ? v.from : paStart(log), v ? v.to : null);
  if (!box) return;
  var pas = finishedPAs(log);
  box.hidden = !pas.length;
  box.innerHTML = pas.map(function (p, i) {
    var on = v && v.from === p.from;
    return '<button type="button" class="pa-chip' + (on ? ' on' : '') + '" data-pa="' + i + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      esc(p.name) + ' <b>' + esc(String(p.word || '').toLowerCase()) + '</b>' + (p.abs ? '<i class="pa-abs" title="a call overturned">abs</i>' : '') + '</button>';
  }).join('');
  /* one sideways row: the chip being viewed in view, else the newest */
  if (pas.length) {
    var show = box.querySelector('.pa-chip.on') || box.lastElementChild;
    var end = show.offsetLeft + show.offsetWidth;   // .pa-hist is positioned, so offsets are its own
    if (end > box.scrollLeft + box.clientWidth || show.offsetLeft < box.scrollLeft) box.scrollLeft = Math.max(0, end - box.clientWidth + 2);
  }
  box.querySelectorAll('.pa-chip').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = pas[+b.dataset.pa];
      S.viewPA = S.viewPA && S.viewPA.from === p.from ? null : { from: p.from, to: p.to, n: log.length };
      renderPAs(st);
    });
  });
}

/* The play by play: a broadcast lower third (the owner, 2026-10-24). It comes up when the result is
   seen, holds, and fades. It takes no tap. No grade, no colour, no tip ever shows during play (the
   owner, 2026-10-17): that all waits for the coach at the end. A tag (the result, in capitals) and
   the rest of the line, in the same place after every pitch. */
var PBP_HOLD_MS = 3600, PBP_MIN_MS = 1800;
/* next: the line waits until the one up now has had its moment (the next hitter up after a strikeout) */
function pbp(tag, rest, next) {
  var el = $('m-pbp');
  clearTimeout(pbp._q);
  var wait = next ? (pbp._at || 0) + PBP_MIN_MS - Date.now() : 0;
  if (wait > 0) { pbp._q = setTimeout(function () { pbp(tag, rest); }, wait); return; }
  pbp._at = Date.now();
  el.innerHTML = '<b class="pbp-tag">' + esc(tag || '') + '</b> <span class="pbp-rest">' + esc(rest || '') + '</span>';
  el.classList.remove('show'); void el.offsetWidth;
  if (!tag && !rest) return;
  el.classList.add('show');
  clearTimeout(pbp._t);
  pbp._t = setTimeout(function () { el.classList.remove('show'); }, PBP_HOLD_MS);
}
var COUNT_WORD = ['', 'one', 'two', 'three'];
var HIT_TAG = { single: 'single', double: 'double', triple: 'triple', home_run: 'home run', error: 'error',
  double_play: 'double play', sac_fly: 'sac fly', fielders_choice: "fielder's choice",
  out_ground: 'ground out', out_line: 'line out', out_fly: 'fly out', out_popup: 'pop out' };
/* the in-play tag: the engine labels a plain out 'out', and the batted ball says which kind */
function inPlayTag(ip) {
  if (HIT_TAG[ip.result]) return HIT_TAG[ip.result];
  if (ip.result === 'out') return HIT_TAG['out_' + (ip.bb || 'fly')] || 'out';
  return 'in play';
}
function playText(pr, batter, after) {
  var who = lastName(batter.name), res = pr.result, c = pr.count, tag, rest;
  var count = c.b + '-' + c.s;
  if (res === 'in_play' && pr.inPlay) { tag = inPlayTag(pr.inPlay); rest = who + ': ' + String(pr.inPlay.text).replace(/\.+$/, '') + '.'; }
  else if (res === 'hit_by_pitch') { tag = 'hit by pitch'; rest = who + '. ' + count; }
  else if (res === 'ball') { tag = pr.paOver ? 'walk' : 'ball'; rest = pr.paOver ? who + '. ' + count : count; }
  else if (res === 'foul') { tag = 'foul'; rest = count; }
  else if (pr.paOver) { tag = 'strikeout'; rest = who + ', ' + (res === 'called_strike' ? 'looking' : 'swinging'); }
  else { tag = res === 'called_strike' ? 'called strike' : res === 'foul_tip' ? 'foul tip' : 'swinging strike'; rest = count; }
  /* THE RADAR GUN (the owner, 2026-10-23): the speed shows after the throw, the drawn pitch's own */
  if (pr.velo != null && isFinite(pr.velo)) rest = Math.round(pr.velo) + ' mph \u00b7 ' + rest;
  if (pr.runs) rest += ' · ' + (pr.runs === 1 ? 'a run scores' : (COUNT_WORD[pr.runs] || pr.runs) + ' runs score');
  // the run that tied it: the outing goes on, so the line says so
  if (pr.runs && isTied(after)) rest += ' · tied ' + after.score.us + '-' + after.score.them;
  return { tag: tag, rest: rest };
}

/* THE RELEASE. A pitch is a type, a cell and a release (the owner's call, 2026-10-22). The
   throw button starts the meter (meter.js) in its place; the tap that stops it is the release,
   and its q rides on the call. Picking another pitch or spot, or Escape, puts the meter away.
   With the meter off (settings) there is no q: the engine plays his own command (1.0x). The
   word after the tap is execution, never the grade: no popup, no colour band. */
function meterOn() { return !!(S.meter && prefs.meter !== false); }
function stopMeter() { if (S.meter && S.meter.running()) S.meter.cancel(); }
function throwIt() {
  if (S.busy || !S.type || S.cell == null || S.outing.status !== 'live') return;
  if (!meterOn()) return fire(slideCall({ type: S.type, cell: S.cell, at: S.at || [0, 0] }));
  if (S.meter.running()) return;
  closeDrawer();
  audio();
  var ap = pitchOf(S.type), bt = batterAt(S.outing.batterIndex);
  var type = S.type, cell = S.cell, at = S.at || [0, 0];
  /* the meter is one panel over the dock (the pitch buttons and the throw button), so it is big
     to hit and nothing over the scene moves */
  $('m-dock').classList.add('metering');
  hush(true);
  runBar();
  var run = S.meter.run({
    quick: !!S.slide,
    command: ap.command, practice: S.mode === 'practice', repeat: repeatOf(type), pitch: ap,
    onStage: stepLine,
    verb: S.outing.shutItLive ? 'shut it' : 'release',
    label: ap.name + ' \u00b7 ' + M.cellWords(cell, bt.bats),
    /* the step line under the meter says what to do; the meter's own corner keeps its word for after the tap */
    hint: ' ',
    place: meterPlace(bt),
    /* the zone is a stop too while the meter runs (the owner, 2026-10-30): its taps go to the meter,
       never to the aim. RE-AIM on the panel (or Escape) cancels it to aim again */
    zone: S.grid.el,
    onSnap: function () { sound('snap'); try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} },
    /* a perfect release: the snap again, and with a perfect power a second one like a mitt's pop */
    onPerfect: function (level) { sound('snap', 60); if (level === 2) sound('pop', 140); },
  });
  stepLine();
  absButton();
  run.then(function (r) {
    hush(false);
    if (!r) { $('m-dock').classList.remove('metering'); updateThrow(); return; }
    var call = slideCall({ type: type, cell: cell, at: at, q: r.q });
    if (r.e != null) call.e = r.e;      // effort: only when the meter offered it (STD_METER.EFFORT)
    fire(call);
  });
}
/* where the combo meter goes (meter-ui.js): the aim layer, the crosshair, and the side of the zone
   away from the hitter for the power column (his box on the 3D mound, else the side he bats from:
   a right handed hitter stands on the right of the pitcher's view) */
function meterPlace(bt) {
  var aim = $('m-aim'), x = aim && aim.querySelector('.aim-x');
  if (!aim) return null;
  var a = aim.getBoundingClientRect(), c = x && x.offsetParent ? x.getBoundingClientRect() : null;
  var side = bt && bt.bats === 'L' ? 'right' : 'left';
  try {
    var st = S.scene && S.scene.real, cv = $('m-canvas');
    if (st && st.figureBoxes && cv) {
      var b = st.figureBoxes(400).batter, r = cv.getBoundingClientRect();
      if (b && isFinite(b.x0)) side = r.left + (b.x0 + b.x1) / 2 > (a.left + a.right) / 2 ? 'left' : 'right';
    }
  } catch (e) {}
  var zEl = aim.querySelector('.aim-zone');
  return { aim: a, zone: zEl ? zEl.getBoundingClientRect() : null, x: c ? c.left + c.width / 2 : null, y: c ? c.top + c.height / 2 : null, side: side };
}
/* the mound holds still while the meter runs (stage.js hush), so nothing redraws under the needle */
function hush(on) { var st = S.scene && S.scene.real; if (st && st.hush) st.hush(on); }
/* rules 2: how many pitches in a row before this one were this type (a good release helps less on a repeat) */
function repeatOf(type) {
  var log = (S.outing && S.outing.rules >= 2 && S.outing.log) || [], n = 0;
  for (var i = log.length - 1; i >= 0 && log[i].call.type === type; i--) n++;
  return n;
}
function meterDone() { if (S.meter) S.meter.hide(); $('m-dock').classList.remove('metering'); }

/* PAINTED is rare and earned (the owner, 2026-10-22: "it always says painted"). All three:
   the meter's best tier (q at or over STD_METER.BEST_Q, the bright band), a called cell on the
   zone's edge or corner (in the zone, not the middle cell: the shadow), and the ball landing in
   that cell. Never on two pitches in a row in an outing. With the meter off there is no q, so
   never. The cue stays quiet: a ring on the cell and a word after the line. */
function isPainted(pr, call) {
  var best = window.STD_METER ? window.STD_METER.BEST_Q : 0.85;
  if (call.q == null || call.q < best) return false;
  if (pr.actualCell !== call.cell || !C.inZone(call.cell) || call.cell === C.cellOf(2, 2)) return false;
  return S.paintedN == null || pr.n !== S.paintedN + 1;
}
/* the ring on the called cell, after the play */
function paintedCue(pr) {
  if (!S.grid || !S.grid.cells) return;
  var c = S.grid.cells[pr.call.cell];
  if (!c) return;
  c.classList.remove('m-painted'); void c.offsetWidth; c.classList.add('m-painted');
  setTimeout(function () { c.classList.remove('m-painted'); }, 1400);
}
/* after a pitch: the mound takes taps again, nothing picked */
function settle() {
  S.busy = false;
  S.grid.setDisabled(false);
  S.grid.setSelected(null);
  S.cell = null; S.at = null; S.type = null;
  document.querySelectorAll('#m-arsenal .pitch').forEach(function (b) { b.classList.remove('sel'); b.setAttribute('aria-pressed', 'false'); });
}
function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

/* THE REVEAL (the owner, 2026-10-22: "I want to be able to see the ball fly and then it should
   come up foul"). The result tag and the scorebug (count, outs, bases, score) change together, at
   the moment the player has seen it happen, never before:
     a take, a called strike, a ball   the ball in the mitt
     a swinging strike, a foul tip     after the swing, the ball in the mitt
     a hit by pitch                     the ball hits him
     a foul                             the ball seen going foul, a beat into its flight
     a ball in play                     the play decided: the catch, the throw beating him, the
                                        ball down for a hit, the home run over the wall
   The stage's hooks.call fires at those moments for everything but a foul (stage.js THE PLAY'S
   TIMELINE: the catch + 0.12 s, or the in-play plan's resolveAt). A foul goes up on hooks.land with
   fair false, which the stage fires when it is seen foul (the umpire's arms starting up), after its
   call; a skip fires it before done. FOUL_BACKSTOP_MS past the call is only a safety net for a stage
   that never fires land. The 2D drawing (anim.js) calls at the plate for everything, so there a foul
   and a ball in play wait for the drawing to end. A tap that skips the play reveals at once, and the
   play's end always reveals. No popup, no grade: one line and the scorebug. This function is the one
   place that says when the tag goes up. */
var FOUL_BACKSTOP_MS = 1600, END_BEAT_MS = 900;
function revealer(pr, show) {
  var done = false, hold = 0;
  var now = function () { if (done) return; done = true; clearTimeout(hold); show(); };
  var foul3d = S.scene.is3d && pr.result === 'foul';
  var waitsForEnd = !S.scene.is3d && (pr.result === 'in_play' || pr.result === 'foul');
  return {
    call: function () {
      if (waitsForEnd || done) return;
      if (foul3d) hold = setTimeout(now, FOUL_BACKSTOP_MS / (prefs.quick ? 1.8 : 1)); else now();
    },
    land: function (info) { if (foul3d && info && info.fair === false) now(); },
    now: now,
  };
}

function fire(call) {
  if (S.busy) return;
  S.busy = true;
  audio();
  updateThrow();
  S.grid.setDisabled(true);
  /* the throw closes the scout drawer and everything it opened (the owner, 2026-10-27); it stays
     shut after the pitch */
  closeDrawer();
  S.hover = null;
  drawPreview();
  $('m-scene').classList.add('flying');
  API.throwPitch(S.outing.outingId, call).then(function (res) {
    var pr = res.pitchResult, batter = batterAt(S.outing.batterIndex);
    var painted = isPainted(pr, call);
    if (painted) S.paintedN = pr.n;
    /* rules 4: the batter challenged the call. The umpire's call goes up when it is seen, and the
       count waits for the ABS replay after the play */
    var byBatter = !!(pr.challenge && pr.challenge.by === 'batter');
    var rv = revealer(pr, function () {
      if (byBatter) { pbp('called strike', lastName(batter.name) + ' challenges.'); return; }
      var t = playText(pr, batter, res.state);
      pbp(t.tag, t.rest + (painted ? ' \u00b7 painted' : ''));
      renderHud(pr.halfOver ? halfEndState(res.state, pr.halfOver) : res.state);
      var sl = stealText(pr.steal);
      if (sl) { pbp(sl.tag, sl.rest, true); if (pr.steal.result === 'out') baseOut(pr.steal.to); }
    });
    var opts = { pr: pr, ap: pitchOf(pr.call.type), quick: !!prefs.quick, hooks: { call: rv.call, land: rv.land, sound: sound, field: hudRunners } };
    return (S.scene.is3d ? S.scene.play(opts) : AN.play(S.scene, opts)).then(function () {
      rv.now();
      S.lastMarker = S.scene.toScreen(pr.actual);
      $('m-scene').classList.remove('flying');
      S.grid.setMarks({ target: pr.call.cell });
      if (painted) paintedCue(pr);
      meterDone();
      hudRunners(null);
      if (S.mini) S.mini.show(pr);
      return byBatter ? absReplay(pr, batter).then(function () {
        var t = playText(pr, batter, res.state);
        pbp(t.tag, t.rest + absNote(pr));
        renderHud(res.state);
      }) : null;
    }).then(function () {
      var pr = res.pitchResult;
      S.outing = res.state;
      /* rules 8: three outs in a half before the last. His team bats its real half on the card, then
         the next half (still busy until the mound is back) */
      if (pr.halfOver && S.outing.status === 'live') return halfBreak(pr.halfOver).then(function () {
        settle();
        if (S.scene.setTarget) S.scene.setTarget(null);
        nextHalf(pr.halfOver);
      });
      // the last pitch: the play has finished on screen, then a beat, then the result (still busy).
      // A ball four that ended it can still be challenged: the button stays up a moment first.
      if (S.outing.status === 'over') return wait(prefs.quick ? END_BEAT_MS / 1.8 : END_BEAT_MS).then(function () {
        if (S.outing.abs && S.outing.abs.challengeLive) return lastCall();
        settle(); return finish();
      });
      settle();
      if (S.scene.setTarget) S.scene.setTarget(null);
      if (pr.paOver) { S.lastMarker = null; S.grid.setMarks({}); setBatter(false); } else S.scene.draw(idleFrame());
      updateThrow();
      if (S.sizeDue) { S.sizeDue = false; relayout(); } else drawPreview();
      renderHud(S.outing);
    });
  }).catch(function (e) {
    S.busy = false;
    meterDone();
    S.grid.setDisabled(false);
    $('m-scene').classList.remove('flying');
    drawPreview();
    updateThrow();
    toast('that pitch did not go. try again.');
    if (window.console) console.warn(e);
  });
}

/* ---- the running game (rules 7, CONTRACT.md 5i) ----------------------------------------------
   The owner (2026-10-26): "Runners could also steal", "yes add pickoffs and slide step". With a
   runner on, a row over the pitch buttons: QUICK DELIVERY (the slide step: a call's ss 1, beats the
   steal, costs him the top of his power, meter.js QUICK) and PICKOFF while state.run.pickoff.live,
   with the disengagements left this plate appearance (two; past them a throw that misses is a
   balk). The steal and the pickoff go in the play by play; an out on the bases is a red dot on the
   scorebug's diamond for a moment. None of it is graded, and nothing here opens by itself. */
var BASE_WORD = { 1: 'first', 2: 'second', 3: 'third', 4: 'home' };
function slideCall(call) { if (S.slide && runnersOn()) call.ss = 1; return call; }
function runnersOn() { var run = S.outing && S.outing.run; return !!(run && run.on && run.on.some(Boolean)); }
function setSlide(on) {
  S.slide = !!on;
  var b = $('m-quick');
  if (b) b.setAttribute('aria-pressed', S.slide ? 'true' : 'false');
}
/* about how much speed a quick delivery costs this pitch: his own speed at max against at QUICK's top */
function slideMph() {
  var run = S.outing && S.outing.run, eMax = run && run.quick && run.quick.eMax, ap = S.type ? pitchOf(S.type) : S.scn.pitcher.arsenal[0];
  if (eMax == null || !ap || !METER || !METER.veloOf) return null;
  var d = METER.veloOf(ap, 1) - METER.veloOf(ap, eMax);
  return isFinite(d) ? Math.max(1, Math.round(d)) : null;
}
function runBar() {
  var bar = $('m-run'), st = S.outing, run = st && st.run;
  if (!bar) return;
  var on = runnersOn();
  if (!on && S.slide) setSlide(false);
  var show = !!(on && st.status === 'live' && !S.busy && !S.absBusy && !(S.meter && S.meter.running()));
  if (bar.hidden !== !show) bar.hidden = !show;
  $('m-dock').classList.toggle('running-game', show);
  if (!show) return;
  var mph = slideMph();
  $('m-quick-l').textContent = 'slide step \u00b7 beats the steal' + (mph ? ' \u00b7 about -' + mph + ' mph' : '');
  var po = run.pickoff || {}, b = $('m-po');
  b.hidden = !po.live;
  if (!po.live) return;
  $('m-po-l').textContent = 'to ' + (BASE_WORD[po.base] || 'the bag') + ' \u00b7 ' + (po.left > 0 ? po.left + ' left' : 'one more is a balk');
  var dots = b.querySelectorAll('.ab-dots i');
  for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < po.left);
  b.classList.toggle('balk', !po.left);
  b.setAttribute('aria-label', 'Pickoff to ' + (BASE_WORD[po.base] || 'the bag') + '. ' + (po.left > 0 ? po.left + ' left before a balk.' : 'A miss now is a balk.'));
}
function stealText(sl) {
  if (!sl || (sl.result !== 'safe' && sl.result !== 'out')) return null;
  var who = lastName(sl.name || 'the runner');
  return sl.result === 'safe' ? { tag: 'stolen base', rest: who + ' takes ' + BASE_WORD[sl.to] + '.' } : { tag: 'caught stealing', rest: who + ' out at ' + BASE_WORD[sl.to] + '.' };
}
function pickoffText(ev, st) {
  var who = lastName(ev.name || 'the runner');
  if (ev.out) return { tag: 'picked off', rest: who + ' out at ' + BASE_WORD[ev.base] + '.' };
  if (ev.balk) return { tag: 'balk', rest: 'runners move up' + (ev.runs ? ' \u00b7 ' + (ev.runs === 1 ? 'a run scores' : ev.runs + ' runs score') : '') + '.' };
  var left = st && st.run && st.run.pickoff ? st.run.pickoff.left : 0;
  return { tag: 'pickoff', rest: who + ' gets back \u00b7 ' + (left > 0 ? left + ' left' : 'one more is a balk') + '.' };
}
/* an out on the bases: a red dot on the scorebug's diamond at that base, for a moment */
function baseOut(base) {
  hudRunners([{ p: base, out: true }]);
  clearTimeout(baseOut._t);
  baseOut._t = setTimeout(function () { hudRunners(null); }, 1600);
}
function pickoffIt() {
  var st = S.outing;
  if (S.busy || S.absBusy || !st || !st.run || !st.run.pickoff || !st.run.pickoff.live) return;
  stopMeter();
  S.busy = true;
  S.grid.setDisabled(true);
  updateThrow();
  var basesBefore = st.bases | 0;
  API.pickoff(st.outingId).then(function (res) {
    var ev = res.pickoff;
    /* the throw on the field, when the stage plays one (stage.js pickoff, the camera agent's #744);
       without it the line and the scorebug say what happened */
    var real = S.scene && S.scene.real;
    var thrown = real && typeof real.pickoff === 'function'
      ? Promise.resolve(real.pickoff({ po: ev, bases: basesBefore, hooks: { sound: sound, field: hudRunners } })).catch(function (e) { if (window.console) console.warn(e); })
      : Promise.resolve();
    return thrown.then(function () { return res; });
  }).then(function (res) {
    var ev = res.pickoff;
    hudRunners(null);
    S.outing = res.state;
    var t = pickoffText(ev, res.state);
    pbp(t.tag, t.rest);
    if (ev.out) baseOut(ev.base);
    if (ev.halfOver && S.outing.status === 'live') {
      renderHud(halfEndState(S.outing, ev.halfOver));
      return wait(prefs.quick ? END_BEAT_MS / 1.8 : END_BEAT_MS).then(function () { return halfBreak(ev.halfOver); }).then(function () { settle(); nextHalf(ev.halfOver); });
    }
    renderHud(S.outing);
    if (S.outing.status === 'over') return wait(prefs.quick ? END_BEAT_MS / 1.8 : END_BEAT_MS).then(function () { settle(); return finish(); });
    S.busy = false;
    S.grid.setDisabled(false);
    updateThrow();
  }).catch(function (e) {
    S.busy = false;
    S.grid.setDisabled(false);
    updateThrow();
    toast('that throw did not go. try again.');
    if (window.console) console.warn(e);
  });
}

/* ---- ABS challenges (rules 4, CONTRACT.md 5f) ------------------------------------------------
   The owner (2026-10-25): challenge a call like MLB in 2026, and see when the batter does. Each side
   has two a game, kept on a win. The button sits beside THROW only while state.abs.challengeLive (a
   called ball, right after it, one left). Every challenge, his or yours, plays a short ABS replay over
   the dock: the ball against the zone, the inches off the edge, then the verdict. A tap skips it.
   Nothing here is a grade, and nothing opens by itself between pitches. */
var ABS_REPLAY_MS = 1500, LAST_CALL_MS = 3500;
function overturned(p) { return !!(p && p.challenge && p.challenge.overturned); }
function renderAbs(st) {
  var a = st && st.abs;
  [['m-usch', a && a.left.pitcher], ['m-themch', a && a.left.batter]].forEach(function (x) {
    var el = $(x[0]);
    el.hidden = !a;
    if (!a) return;
    for (var i = 0; i < el.children.length; i++) el.children[i].classList.toggle('on', i < x[1]);
    el.setAttribute('aria-label', x[1] + (x[1] === 1 ? ' challenge' : ' challenges') + ' left');
  });
  $('m-key-abs').hidden = !a;
  absButton();
}
/* up only while a challenge is live and nothing is playing: right after a called ball, until the
   next throw starts (or, on a ball four that ended it, through the last call window) */
function absButton() {
  var b = $('m-abs-b'), st = S.outing, a = st && st.abs;
  var on = !!(a && a.challengeLive && !S.absBusy && !(S.meter && S.meter.running()) &&
    (S.endWin ? true : !S.busy && st.status === 'live'));
  if (b.hidden === !on && !on) return;
  b.hidden = !on;
  $('m-pad').classList.toggle('abs-live', on);
  b.classList.toggle('clock', !!(on && S.endWin));
  if (!on) return;
  var n = a.left.pitcher, dots = b.querySelectorAll('.ab-dots i');
  for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < n);
  b.setAttribute('aria-label', 'Challenge the call. ' + n + ' left.');
}
/* the zone's dots for an overturned call carry a ring (aim.js draws one dot per shown pitch, in order) */
function markAbsDots(log, from, to) {
  var box = S.grid && S.grid.el && S.grid.el.querySelector('.dots');
  if (!box) return;
  var end = to == null ? log.length : to, k = 0;
  for (var i = from; i < end; i++) {
    if (!log[i] || !log[i].actual) continue;
    var dot = box.children[k++];
    if (dot) dot.classList.toggle('abs', overturned(log[i]));
  }
}
function absNote(pr) { return pr.challenge ? (pr.challenge.overturned ? ' · overturned' : ' · call stands') : ''; }

/* The ball against the ABS zone, in inches, the pitcher's view. The zone is the grid's: the plate
   plus a ball a side, his height. The dot sits where it crossed, held so its distance from the edge is
   the engine's d (the UI does not have the pack's zone height, so the drawing defers to d). */
function absSvg(pr, batter, color) {
  var W = C.GRID.ZONE_HALF_FT * 24, zf = batter && batter.szTop > batter.szBot ? batter.szTop - batter.szBot : 1.8;
  var H = zf * 12, P = 5, R = 1.45, d = pr.abs.d;
  var su = window.STD_AIM ? window.STD_AIM.SCREEN_U : -1;
  var x = su * pr.actual.x * 12, y = (1 - pr.actual.zn) * H;
  /* the nearest point on the zone's edge, and the way out of the zone from there */
  var ex, ey, nx, ny, inside = Math.abs(x) <= W / 2 && y >= 0 && y <= H;
  if (inside) {
    var sides = [[W / 2 - x, W / 2, y, 1, 0], [x + W / 2, -W / 2, y, -1, 0], [y, x, 0, 0, -1], [H - y, x, H, 0, 1]];
    sides.sort(function (a, b) { return a[0] - b[0]; });
    ex = sides[0][1]; ey = sides[0][2]; nx = sides[0][3]; ny = sides[0][4];
  } else {
    ex = Math.max(-W / 2, Math.min(W / 2, x)); ey = Math.max(0, Math.min(H, y));
    var vx = x - ex, vy = y - ey, l = Math.sqrt(vx * vx + vy * vy) || 1;
    nx = vx / l; ny = vy / l;
  }
  /* d > 0 is in the zone (against the way out), d < 0 out of it */
  x = ex - nx * d; y = ey - ny * d;
  x = Math.max(-W / 2 - P + R, Math.min(W / 2 + P - R, x)); y = Math.max(-P + R, Math.min(H + P - R, y));
  var f = function (v) { return v.toFixed(2); };
  var grid = '';
  for (var i = 1; i < 3; i++) {
    grid += '<line x1="' + f(-W / 2 + W * i / 3) + '" y1="0" x2="' + f(-W / 2 + W * i / 3) + '" y2="' + f(H) + '"/>' +
      '<line x1="' + f(-W / 2) + '" y1="' + f(H * i / 3) + '" x2="' + f(W / 2) + '" y2="' + f(H * i / 3) + '"/>';
  }
  return '<svg viewBox="' + f(-W / 2 - P) + ' ' + f(-P) + ' ' + f(W + 2 * P) + ' ' + f(H + 2 * P) + '" aria-hidden="true">' +
    '<rect class="ar-plate" x="' + f(-W / 2) + '" y="0" width="' + f(W) + '" height="' + f(H) + '"/>' +
    '<g class="ar-grid">' + grid + '</g>' +
    '<line class="ar-edge" x1="' + f(ex) + '" y1="' + f(ey) + '" x2="' + f(x) + '" y2="' + f(y) + '"/>' +
    '<circle class="ar-ball" cx="' + f(x) + '" cy="' + f(y) + '" r="' + R + '" fill="' + color + '"/></svg>';
}
function inchWords(d) {
  var a = Math.abs(d);
  if (a < 0.05) return 'on the edge';
  return a.toFixed(1) + '" ' + (d >= 0 ? 'in' : 'off');
}
/* The quick replay after a challenge (about 1.5 s; quick play shortens it). A tap, a key or a tap on
   the field skips it. Resolves when it is gone. */
function absReplay(pr, batter) {
  var box = $('m-absr'), ch = pr.challenge;
  if (!box || !pr.abs || !ch) return Promise.resolve();
  var ap = pitchOf(pr.call.type), who = ch.by === 'pitcher' ? 'you challenge' : lastName(batter.name) + ' challenges';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ms = prefs.quick ? ABS_REPLAY_MS / 1.5 : ABS_REPLAY_MS;
  box.className = 'absr ' + (ch.overturned ? 'over' : 'stands') + (prefs.quick ? ' quick' : '');
  box.innerHTML = '<div class="ar-zone">' + absSvg(pr, batter, ap ? colorOf(ap) : '#f4f5f7') + '</div>' +
    '<div class="ar-txt"><span class="ar-k"><b>abs</b> ' + esc(who) + '</span>' +
    '<span class="ar-d"><b>' + (pr.abs.strike ? 'strike' : 'ball') + '</b> ' + esc(inchWords(pr.abs.d)) + '</span>' +
    '<span class="ar-v">' + (ch.overturned ? 'overturned' : 'call stands') + '</span></div>';
  box.hidden = false;
  $('m-dock').classList.add('replaying');
  void box.offsetWidth;
  box.classList.add('show');
  sound('pop');
  return new Promise(function (res) {
    var done = false, t = 0;
    var end = function () {
      if (done) return;
      done = true; clearTimeout(t);
      document.removeEventListener('pointerdown', end, true);
      document.removeEventListener('keydown', end, true);
      box.classList.remove('show');
      setTimeout(function () { box.hidden = true; $('m-dock').classList.remove('replaying'); res(); }, reduce ? 0 : 180);
    };
    t = setTimeout(end, ms);
    /* the tap that skips it; a beat first, so the tap that made the challenge is not taken for one */
    setTimeout(function () {
      if (done) return;
      document.addEventListener('pointerdown', end, true);
      document.addEventListener('keydown', end, true);
    }, 150);
  });
}

/* the pitcher's side challenges the last called ball: the replay, then the count as it now stands */
function challengeIt() {
  var st = S.outing;
  if (S.absBusy || !st || !st.abs || !st.abs.challengeLive) return;
  if (S.busy && !S.endWin) return;
  var last = S.endWin;
  if (last) { clearTimeout(S.endWinT); S.endWin = null; }
  var log = st.log || [], pr0 = log[log.length - 1];
  var batter = batterAt(pr0 && pr0.paOver ? st.batterIndex - 1 : st.batterIndex);
  stopMeter();
  S.absBusy = true; S.busy = true;
  S.grid.setDisabled(true);
  updateThrow();
  API.challenge(st.outingId).then(function (res) {
    var pr = res.pitchResult;
    return absReplay(pr, batter).then(function () {
      var was = S.outing.batterIndex;
      S.outing = res.state;
      S.absBusy = false;
      var t = playText(pr, batter, res.state);
      if (S.outing.status === 'over') {
        pbp(t.tag, t.rest + absNote(pr));
        renderHud(S.outing);
        return wait(prefs.quick ? END_BEAT_MS / 1.8 : END_BEAT_MS).then(function () { settle(); return finish(); });
      }
      settle();
      if (last && S.scene.setTarget) S.scene.setTarget(null);
      /* an overturned ball four: the same hitter stays up */
      if (S.outing.batterIndex !== was) { S.lastMarker = null; S.grid.setMarks({}); setBatter(true); }
      S.scene.draw(idleFrame());
      pbp(t.tag, t.rest + absNote(pr));
      renderHud(S.outing);
      updateThrow();
      if (S.sizeDue) { S.sizeDue = false; relayout(); } else drawPreview();
    });
  }).catch(function (e) {
    S.absBusy = false;
    if (last) { settle(); finish(); return; }
    S.busy = false;
    S.grid.setDisabled(false);
    updateThrow();
    toast('that challenge did not go. try again.');
    if (window.console) console.warn(e);
  });
}
/* A ball four that ended the outing can still be challenged: the button stays up with a clock for a
   moment, then the result comes up by itself. */
function lastCall() {
  var ms = prefs.quick ? LAST_CALL_MS / 1.4 : LAST_CALL_MS;
  $('m-abs-b').style.setProperty('--clock', ms + 'ms');
  S.endWin = true;
  absButton();
  S.endWinT = setTimeout(function () {
    if (!S.endWin) return;
    S.endWin = null;
    absButton();
    settle();
    finish();
  }, ms);
}

/* ---- between two of his halves (rules 8, CONTRACT.md 5j) -------------------------------------------
   The owner (2026-10-30): finish the 8th, see his team bat on the box score, then back out for the 9th.
   The pitch (or the steal or pickoff) that makes the third out of a half before the last carries
   halfOver. The scorebug shows that third out on the half it ended, then the card (box-ui.js, its own
   screen, a few seconds, a tap skips it), then the mound for the next half: its leadoff man, the
   score his team left, nobody on. No grade, nothing to read before going on. */
function halfEndState(st, ho) {
  return Object.assign({}, st, { outs: 3, bases: 0, count: { b: 0, s: 0 }, score: ho.done.score,
    half: { inning: ho.done.inning, half: ho.done.half } });
}
function halfBreak(ho) {
  var BOX = window.STD_BOX_UI;
  if (!BOX) return Promise.resolve();
  return wait(prefs.quick ? END_BEAT_MS / 1.8 : END_BEAT_MS).then(function () {
    stopMeter(); meterDone(); closeDrawer(true);
    show('s-half');
    return BOX.play(ho, { quick: !!prefs.quick });
  }).then(function () {
    show('s-mound');
  });
}
function nextHalf(ho) {
  S.lastMarker = null;
  S.grid.setMarks({});
  hudRunners(null);
  if (S.mini) S.mini.reset();
  renderHud(S.outing);
  setBatter(true);
  var nx = ho.next, b = batterAt(S.outing.batterIndex);
  pbp(isTied(S.outing) ? 'tied' : '', (nx.half === 'top' ? 'top' : 'bottom') + ' of the ' + ord(nx.inning) + '. ' + b.name + ' leads off.');
  updateThrow();
  if (S.sizeDue) { S.sizeDue = false; relayout(); } else drawPreview();
}

/* ---- the end ----------------------------------------------------------------------------- */

function finish() {
  return API.finishOuting(S.outing.outingId).then(function (r) {
    if (S.mode === 'survivor') return survivorNext(r);
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

/* The daily's result carries the save (signed out) and the vote for tomorrow. Neither on practice or
   an archive day. Both are blocks the player reads when they choose; nothing opens. */
function renderModes() {
  if (!MU) return;
  var daily = S.mode === 'daily';
  if (daily) MU.saveBlock($('r-save'), { account: S.result && S.result.account, justSaved: S.saved });
  else { $('r-save').hidden = true; }
  if (daily && S.dailyResult) MU.voteBlock($('r-vote')); else { $('r-vote').hidden = true; voteRow(null); }
}
/* The result's menu carries one row to the vote while it is open (the owner, 2026-10-30): on a phone
   the vote's tile sits below the menu. The row only scrolls to it; it never opens anything. */
function voteRow(v) {
  var b = $('r-vote-go'), on = !!(v && v.open && v.candidates && v.candidates.length === 2) && S.mode === 'daily';
  var was = !b.hidden;
  b.hidden = !on;
  if (on) b.querySelector('span').textContent = v.myVote ? 'your vote is in' : v.canVote ? 'pick the next spot' : 'see the two spots';
  if (was && !on && b.classList.contains('sel')) navSelect($('r-coach'));
}
function jumpToVote() {
  var t = $('r-vote');
  if (t.hidden) return;
  t.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  var f = t.querySelector('.vt-o:not([disabled]), [data-save]') || t;
  if (f === t) t.setAttribute('tabindex', '-1');
  try { f.focus({ preventScroll: true }); } catch (e) {}
}

/* ---- Survivor (CONTRACT.md 17): a run of saves --------------------------------------------------
   The home's row opens its screen; start plays the day's run on the mound as the daily does. A
   door shut goes straight on: a moment with the saves and the next closer (#s-next), then the next
   spot. Anything else ends the run on the Survivor screen, with its board. No result screen and no
   grade between spots. */
function startSurvivor() {
  if (!API.survivorStart) return;
  Promise.resolve().then(function () { return API.survivorStart(); }).then(function (go) {
    playSurvivor(go);
  }).catch(function (e) {
    var used = e && /one run a day/.test(e.message || '');
    toast(used ? 'today\'s run is used. next one opens at midnight eastern.' : 'the run didn\'t start. try again.');
    if (MU) MU.showSurvivor();
    if (!used && window.console) console.warn(e);
  });
}
function playSurvivor(go) {
  S.scn = go.scenario;
  S.mode = 'survivor';
  S.outing = go.state;
  S.result = null;
  if (S.outing.status === 'over') return finish();
  enterMound();
  pbp('survivor', (go.saves ? go.saves + (go.saves === 1 ? ' save. ' : ' saves. ') : '') + batterAt(S.outing.batterIndex).name + ' leads off.');
}
function survivorNext(r) {
  var sv = r.survivor || {};
  if (sv.over) {
    show('s-surv');
    if (MU) MU.showSurvivor();
    renderHomeState();
    return;
  }
  /* the next spot loads while the saves show */
  var next = Promise.resolve().then(function () { return API.survivorStart(); });
  return next.then(function (go) {
    show('s-next');
    return MU.between(sv.saves, go.scenario, !!prefs.quick).then(function () {
      /* THE VIDEO BREAK between two spots (ads.js): a player who is not Pro, after the saves show.
         A Pro player goes straight on. */
      var ent = MU.ent && MU.ent(), pro = !!(ent && ent.pro);
      return window.STD_ADS ? STD_ADS.between(pro) : null;
    }).then(function () { playSurvivor(go); });
  }).catch(function (e) {
    toast('the next spot didn\'t load. try again.');
    show('s-surv');
    if (MU) MU.showSurvivor();
    if (window.console) console.warn(e);
  });
}
function openSurvivor() {
  if (!MU) return;
  if (MN.isOpen()) MN.close(true);
  show('s-surv');
  MU.showSurvivor();
}

/* ---- the archive (Pro, CONTRACT.md 17): a past daily on its own spot and seed. Only reachable
   when entitlements() says archive, which is false for everyone until Pro exists. */
function playArchive(day) {
  if (MN.isOpen()) MN.close(true);
  API.getScenario(day).then(function (scn) {
    return API.startOuting(scn.id, null, { mode: 'archive', day: day }).then(function (st) {
      S.scn = scn;
      S.mode = 'archive';
      S.outing = st;
      if (st.status === 'over') return finish();
      enterMound();
      pbp('archive', '#' + scn.number + '. ' + batterAt(st.batterIndex).name + ' leads off.');
    });
  }).catch(function (e) {
    toast(e && /for Pro/.test(e.message || '') ? 'past dailies open later.' : 'that day didn\'t load. try again.');
    if (window.console) console.warn(e);
  });
}

/* runs allowed: the result's own, or the outing's score against the spot's */
function runsOf(r, st) { return r.runs != null ? r.runs : st && st.score ? st.score.them - S.scn.situation.score.them : null; }

function renderResult() {
  var r = S.result, s = S.scn, st = S.mode === 'daily' ? S.daily || S.outing : S.outing;
  var runs = runsOf(r, st);
  $('r-eyebrow').textContent = S.mode === 'practice' ? 'practice · not scored' : (S.mode === 'archive' ? 'archive · ' : '') + (s.preview ? 'preview' : '#' + s.number) + ' · final · ' + s.title.toLowerCase();
  var o = $('r-outcome');
  o.textContent = C.OUTCOME_LABEL[r.outcome];
  o.className = 'outcome ' + r.outcome;
  $('r-hero').className = 'r-hero ' + r.outcome;
  /* the closer's club on the rail's edge, from the pack */
  var tc = s.pitcher.teamColors;
  $('s-result').style.setProperty('--club', tc && tc[0] ? tc[0] : '');
  var p = Math.round(r.percentile);
  R.nums = { p: r.pitches, r: runs, pct: p };
  $('r-kp').innerHTML = '<b>' + esc(r.pitches) + '</b>' + (r.pitches === 1 ? 'pitch' : 'pitches');
  $('r-kr').hidden = runs == null;
  $('r-kr').innerHTML = runs != null ? '<b>' + esc(runs) + '</b>' + (runs === 1 ? 'run' : 'runs') : '';
  $('r-npitch').textContent = r.pitches + (r.pitches === 1 ? ' pitch' : ' pitches');
  $('r-strip').innerHTML = stripHTML(r.strip, true);
  var WORD = { green: 'the call', yellow: 'close', orange: 'costly', red: 'wrong idea' };
  $('r-legend').innerHTML = C.BANDS.map(function (b) { return '<span><i class="sq ' + b.band + '"></i>' + WORD[b.band] + '</span>'; }).join('');
  $('r-pct').innerHTML = p + '<sup>' + ordSuffix(p) + '</sup>';
  $('r-kpct').setAttribute('aria-label', p + ordSuffix(p) + ' of closers');
  $('r-pctline').innerHTML = 'better than <b>' + esc(p) + '%</b> of the closer pool in this spot.';
  $('r-score').textContent = r.score != null ? 'score ' + r.score : '';
  $('r-chart').innerHTML = poolChart(r);
  $('r-like').textContent = r.pitchedLike ? r.pitchedLike.name : '-';
  $('r-why').textContent = r.pitchedLike ? r.pitchedLike.reason : '';
  var rv = r.reveal || {};
  $('r-real').className = 'vsbar ' + (r.vsReal || 'none');
  $('r-real').innerHTML = '<div class="vs-t"><small>' + VS_LABEL + '</small>' +
    '<b class="vs ' + esc(r.vsReal) + '">' + esc(vsHead(r.vsReal)) + '</b>' +
    vsWhy(r, rv, runs) + '</div>';
  $('r-reveal').innerHTML = compareCard(r, rv, runs, st);
  $('r-share').hidden = S.mode !== 'daily';
  $('r-tomorrow').textContent = S.mode === 'daily' ? 'back tomorrow for #' + (s.number + 1) + '.' : '';
  renderStreak();
  /* the stagger's order: the strip's squares, the menu's rows, the tiles, the pitches */
  ['#r-strip .sq', '#r-nav .nv:not([hidden])', '#s-result .r-tile', '#r-reveal .pc'].forEach(function (q) {
    document.querySelectorAll(q).forEach(function (el, i) { el.style.setProperty('--i', Math.min(i, 24)); });
  });
  navSelect($('r-coach'));
}

/* ---- the result's motion and its menu ------------------------------------------------------
   The entrance plays once each time the result comes up: the outcome slams in, the rail and the
   tiles rise, the three numbers count up to the engine's own. Reduced motion shows them at once.
   The menu is console rows: the selected one is signal, arrow keys or a pad's d-pad move it, enter
   or the pad's A picks it. Nothing on it opens by itself. */
var R = { nums: null, run: 0, pad: 0, padHeld: 0 };
function reducedMotion() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function playResult() {
  var sec = $('s-result');
  sec.classList.remove('r-play'); void sec.offsetWidth; sec.classList.add('r-play');
  var n = R.nums, my = ++R.run;
  if (!n) return;
  var set = function (k) {
    var pv = Math.round(n.p * k), rv = n.r == null ? null : Math.round(n.r * k), cv = Math.round(n.pct * k);
    $('r-kp').firstChild.textContent = pv;
    if (rv != null) $('r-kr').firstChild.textContent = rv;
    $('r-pct').innerHTML = cv + '<sup>' + ordSuffix(cv) + '</sup>';
  };
  if (reducedMotion()) { set(1); return; }
  var t0 = null, MS = 900, DELAY = 420;
  set(0);
  function tick(t) {
    if (my !== R.run) return;
    if (t0 == null) t0 = t;
    var k = Math.max(0, Math.min(1, (t - t0 - DELAY) / MS));
    set(1 - Math.pow(1 - k, 3));
    if (k < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function navRows() { return [].slice.call(document.querySelectorAll('#r-nav .nv')).filter(function (b) { return !b.hidden; }); }
function navSelect(b) {
  if (!b) return;
  navRows().forEach(function (x) { x.classList.toggle('sel', x === b); });
}
function navMove(d) {
  var rows = navRows(), cur = rows.indexOf(document.querySelector('#r-nav .nv.sel'));
  var next = rows[Math.max(0, Math.min(rows.length - 1, cur + d))] || rows[0];
  navSelect(next);
  next.focus({ preventScroll: true });
}
function resultIdle() { return document.body.dataset.screen === 's-result' && !document.querySelector('.sheet.on'); }
function initResultNav() {
  var nav = $('r-nav');
  nav.addEventListener('mouseover', function (e) { var b = e.target.closest('.nv'); if (b) navSelect(b); });
  nav.addEventListener('focusin', function (e) { var b = e.target.closest('.nv'); if (b) navSelect(b); });
  document.addEventListener('keydown', function (e) {
    if (!resultIdle() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    /* inside the menu the arrows move it; elsewhere they scroll, except on a desk with nothing focused */
    var inNav = nav.contains(document.activeElement);
    var desk = window.matchMedia && matchMedia('(min-width: 1100px)').matches;
    if (!inNav && !(desk && (document.activeElement === document.body || !document.activeElement))) return;
    e.preventDefault();
    if (!inNav) { var sel = nav.querySelector('.nv.sel') || navRows()[0]; sel.focus({ preventScroll: true }); return; }
    navMove(e.key === 'ArrowDown' ? 1 : -1);
  });
  /* a pad: the d-pad or the left stick moves the menu, A picks. Read only while a pad is connected */
  window.addEventListener('gamepadconnected', function () { if (!R.pad) R.pad = requestAnimationFrame(padTick); });
}
function padTick(t) {
  var pads = navigator.getGamepads ? [].slice.call(navigator.getGamepads()).filter(Boolean) : [];
  if (!pads.length) { R.pad = 0; return; }
  R.pad = requestAnimationFrame(padTick);
  if (!resultIdle()) return;
  var g = pads[0], btn = function (i) { return !!(g.buttons[i] && g.buttons[i].pressed); };
  var y = g.axes && g.axes[1] || 0;
  var dir = btn(12) || y < -0.6 ? -1 : btn(13) || y > 0.6 ? 1 : 0, a = btn(0);
  var key = dir ? 'd' + dir : a ? 'a' : '';
  if (!key) { R.padHeld = 0; R.padKey = ''; return; }
  if (key === R.padKey && t - R.padHeld < 260) return;
  R.padKey = key; R.padHeld = t;
  if (dir) navMove(dir);
  else { var sel = document.querySelector('#r-nav .nv.sel'); if (sel) sel.click(); }
}

/* ---- you against the real game ---------------------------------------------------------------
   You pitch as him, so the comparison is with what really happened (the owner, 2026-10-26: "you
   beat Yamamoto sounds weird when you're also playing as him"). The verdict is the engine's
   (vsReal: the outcome, then runs, then pitches when his count is known). The line under it says
   which of the three decided it, in the result's own numbers. */
var VS_LABEL = 'you vs the real game';
var VS_SHORT = { beat: 'rewrote history', matched: 'matched history', lost: 'history did better' };
function vsHead(v) {
  return v === 'beat' ? 'you rewrote history' : v === 'matched' ? 'you matched history' : v === 'lost' ? 'history did better' : '-';
}
/* the real game's column: the year when the pack has it */
function realCol() { var y = S.scn && S.scn.pitcher && S.scn.pitcher.year; return y ? String(y) : 'real game'; }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
/* two labelled lines, like the side by side card: your result, the real result. The outcome first,
   then runs when the outcomes tie, then pitches when the runs tie too (the order vsReal decides by). */
function vsParts(r, rv, runs) {
  var label = function (o) { return (C.OUTCOME_LABEL[o] || '').toLowerCase(); };
  if (!label(r.outcome) || !label(rv.outcome)) return null;
  var mine = [label(r.outcome)], real = [label(rv.outcome)];
  if (r.outcome === rv.outcome && runs != null && rv.runs != null) {
    mine.push(plural(runs, 'run', 'runs')); real.push(plural(rv.runs, 'run', 'runs'));
    if (runs === rv.runs && typeof rv.pitches === 'number') {
      mine.push(plural(r.pitches, 'pitch', 'pitches')); real.push(plural(rv.pitches, 'pitch', 'pitches'));
    }
  }
  return { mine: mine.join(' · '), real: real.join(' · ') };
}
function vsWhy(r, rv, runs) {
  var p = vsParts(r, rv, runs);
  return p ? '<span class="vs-l"><i>your result</i>' + esc(p.mine) + '</span><span class="vs-l"><i>real result</i>' + esc(p.real) + '</span>' : '';
}
/* the same two lines as plain text, for the share card's canvas */
function vsText(r, rv, runs) {
  var p = vsParts(r, rv, runs);
  return p ? 'your result: ' + p.mine + '. real result: ' + p.real + '.' : null;
}

/* Your plate appearances from the outing's log: one per batter, in order, each with its pitches.
   The word is the play by play's tag on the pitch that ended it; each pitch keeps its own tag. */
function myPAs(log, strip) {
  var out = [], start = 0, bi = 0, runs = 0;
  (log || []).forEach(function (pr, i) {
    runs += pr.runs || 0;
    if (!pr.paOver && i < log.length - 1) return;
    var b = batterAt(bi);
    var calls = log.slice(start, i + 1).map(function (q, j) {
      return { n: start + j + 1, type: q.call && q.call.type, velo: q.velo, count: q.countBefore, tag: playText(q, b).tag, band: strip && strip[start + j] };
    });
    out.push({ batter: b.name, bats: b.bats, word: playText(pr, b).tag, pitches: i - start + 1, runs: runs, calls: calls });
    start = i + 1; runs = 0;
    if (pr.paOver) bi++;
  });
  return out;
}
/* a pitch type's chip takes ink text on a light colour */
function lightColor(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return false;
  var v = parseInt(m[1], 16), r = v >> 16 & 255, g = v >> 8 & 255, b = v & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}
/* the card is narrow: the two long strike tags get their short form (the title keeps the long one) */
var CARD_TAG = { 'swinging strike': 'swinging', 'called strike': 'called' };
var BAND_WORD = { green: 'the call', yellow: 'close', orange: 'costly', red: 'wrong idea' };
function pitchCard(c) {
  var col = TYPE_COLORS[c.type] || '#64748b', nm = typeName(c.type);
  var v = c.velo != null && isFinite(c.velo) ? Math.round(c.velo) : null;
  var cnt = c.count ? c.count.b + '-' + c.count.s : '';
  var meta = [v, cnt].filter(function (x) { return x != null && x !== ''; }).join(' · ');
  var title = 'pitch ' + c.n + ': ' + nm + (v != null ? ', ' + v + ' mph' : '') + (cnt ? ', ' + cnt : '') + ', ' + c.tag + (c.band ? ', ' + BAND_WORD[c.band] : '');
  return '<span class="pc" title="' + esc(title) + '"><b class="n">' + c.n + '</b>' +
    '<span class="ty' + (lightColor(col) ? ' lt' : '') + '" style="--tc:' + col + '">' + esc(c.type) + '</span>' +
    '<span class="m">' + esc(meta) + '</span><span class="m">' + esc(CARD_TAG[c.tag] || c.tag) + '</span><i class="bd ' + esc(c.band || '') + '"></i></span>';
}

/* Two columns, you and the real game. The outcome, runs and pitches, then one row per batter faced
   in the real order, with your pitches between his name and the two results. A batter one side
   never faced is a quiet dash. Only an unambiguous edge is marked: the better outcome, fewer runs,
   fewer pitches. A plate appearance is never judged. */
function compareCard(r, rv, runs, st) {
  var none = '<span class="v none">-</span>';
  var cell = function (html, win, cls) { return '<span class="v' + (cls ? ' ' + cls : '') + (win ? ' win' : '') + '">' + html + '</span>'; };
  var row = function (k, a, b) { return '<div class="cmp-row"><span class="k">' + k + '</span>' + a + b + '</div>'; };
  var rk = C.OUTCOME_RANK, mineO = rk[r.outcome], hisO = rk[rv.outcome];
  var hp = typeof rv.pitches === 'number' ? rv.pitches : null;
  var col = realCol();
  var rows =
    row('result', cell('<b class="o ' + esc(r.outcome) + '">' + esc((C.OUTCOME_LABEL[r.outcome] || '').toLowerCase()) + '</b>', mineO > hisO),
      rv.outcome ? cell('<b class="o ' + esc(rv.outcome) + '">' + esc((C.OUTCOME_LABEL[rv.outcome] || '').toLowerCase()) + '</b>', hisO > mineO) : none) +
    row('runs', runs == null ? none : cell('<b>' + esc(runs) + '</b>', rv.runs != null && runs < rv.runs),
      rv.runs == null ? none : cell('<b>' + esc(rv.runs) + '</b>', runs != null && rv.runs < runs)) +
    row('pitches', cell('<b>' + esc(r.pitches) + '</b>', hp != null && r.pitches < hp),
      hp != null ? cell('<b>' + esc(hp) + '</b>', hp < r.pitches) : cell(esc(rv.pitchesNote || 'not on record'), false, 'note'));
  var mine = myPAs(st && st.log, r.strip), real = rv.plateAppearances || [];
  var n = Math.max(mine.length, real.length), bats = '';
  var bat = (clubsOf(S.scn).them || {}).pri || '';
  for (var i = 0; i < n; i++) {
    var a = mine[i], b = real[i], name = a ? a.batter : b.batter;
    var side = function (pa, word, cls, lbl) {
      if (!pa) return '<span class="v none ' + cls + '"><i>' + lbl + '</i>-</span>';
      return '<span class="v ' + cls + '"><i>' + lbl + '</i>' + esc(word) + (pa.pitches != null ? '<small>' + plural(pa.pitches, 'pitch', 'pitches') + '</small>' : '') + '</span>';
    };
    var bats1 = a ? a.bats : null;
    bats += '<div class="cmp-bat"' + (bat ? ' style="--bat:' + esc(bat) + '"' : '') + '>' +
      '<span class="ab-who"><span class="i">AB ' + (i + 1) + '</span><b class="nm">' + esc(name) + '</b>' + (bats1 ? '<small>bats ' + esc(bats1) + '</small>' : a ? '' : '<small>you never faced him</small>') + '</span>' +
      (a ? '<span class="ab-trk">' + a.calls.map(pitchCard).join('') + '</span>' : '<span class="ab-trk empty"></span>') +
      side(a, a && a.word, 'you', 'you') + side(b, b && b.result, 'real', col) + '</div>';
  }
  return '<div class="cmp-row cmp-head"><span class="k"></span><span class="who you">you</span><span class="who him">' + esc(col) + '</span></div>' +
    rows + bats +
    (rv.summary ? '<p class="cmp-sum"><b>what happened</b> ' + esc(rv.summary) + '.</p>' : '');
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

/* ---- share: the card as an image, the text as before ------------------------------------------
   The share sheet opens from a share button only. It draws the card (card.js) at both sizes as it
   opens, so the share button inside it hands the file over in the same tap: a browser only lets
   navigator.share run straight off a tap. Where files cannot be shared, the image is saved instead,
   and the text is always one tap away. */
function shareText(r) { return r.share || (window.STD_SHARE && window.STD_SHARE.text(r, S.scn.number)) || ''; }
function copyText(text) {
  function copied() { toast('copied. paste it anywhere.'); }
  function fallback() {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); copied();
    } catch (e) { toast('could not copy.'); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(copied, fallback);
  else fallback();
}
/* the old share: the text, through the share sheet on a phone, else copied */
function shareTextOnly(text) {
  var touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (navigator.share && touch) { navigator.share({ text: text }).catch(function () {}); return; }
  copyText(text);
}
/* what the card shows, every piece from the result */
function cardOf(r) {
  var s = S.scn, st = S.daily || S.outing;
  var rv = r.reveal || {};
  return {
    outcome: r.outcome, strip: r.strip || [], pitches: r.pitches, percentile: r.percentile,
    label: s.preview ? 'preview' : '#' + s.number, title: s.title,
    vsReal: r.vsReal || null, vsLabel: VS_LABEL,
    vsHead: r.vsReal ? vsHead(r.vsReal) : null, vsWhy: r.vsReal && rv.outcome ? vsText(r, rv, runsOf(r, st)) : null,
    pitchedLike: r.pitchedLike && r.pitchedLike.name || null,
  };
}
var SH = { size: 'tall', files: {}, text: '', n: 0 };
function share(r) {
  var CARD = window.STD_CARD, text = shareText(r);
  if (!CARD || !document.createElement('canvas').getContext) { shareTextOnly(text); return; }
  var my = ++SH.n;
  SH.text = text; SH.files = {}; SH.urls = SH.urls || {};
  Object.keys(SH.urls).forEach(function (k) { try { URL.revokeObjectURL(SH.urls[k]); } catch (e) {} });
  SH.urls = {};
  var name = 'shut-the-door-' + (S.scn.preview ? 'preview' : S.scn.number);
  renderShare('loading');
  MN.open('sheet-share');
  var c = cardOf(r);
  ['tall', 'wide'].reduce(function (p, size) {
    return p.then(function () { return CARD.render(c, size); }).then(CARD.blob).then(function (b) {
      if (my !== SH.n) return;
      SH.files[size] = new File([b], name + (size === 'wide' ? '-wide' : '') + '.png', { type: 'image/png' });
      SH.urls[size] = URL.createObjectURL(b);
      if (size === SH.size || !SH.urls[SH.size]) renderShare();
    });
  }, Promise.resolve()).catch(function (e) {
    if (my !== SH.n) return;
    if (window.console) console.warn(e);
    renderShare('fail');
  });
}
function canShareFile(f) {
  try { return !!(f && navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; }
}
function saveFile(f) {
  var a = document.createElement('a');
  a.href = SH.urls[SH.size]; a.download = f.name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  toast('saved. post it anywhere.');
}
function renderShare(state) {
  var body = $('share-body');
  if (state === 'fail') {
    body.innerHTML = '<p class="quiet">the image did not draw. the text still works.</p>' +
      '<button class="btn go" type="button" id="sh-text">copy the text</button>';
    $('sh-text').addEventListener('click', function () { copyText(SH.text); });
    return;
  }
  var f = SH.files[SH.size], url = SH.urls[SH.size];
  var canFile = canShareFile(f);
  body.innerHTML =
    '<div class="seg sh-seg" role="tablist" aria-label="Image size">' +
    '<button type="button" role="tab" data-size="tall" aria-selected="' + (SH.size === 'tall') + '">post</button>' +
    '<button type="button" role="tab" data-size="wide" aria-selected="' + (SH.size === 'wide') + '">wide</button></div>' +
    '<div class="sh-prev ' + SH.size + '">' + (url ? '<img id="sh-img" src="' + url + '" alt="your result card">' : '<span class="load-mark" aria-hidden="true"></span><span>drawing your card</span>') + '</div>' +
    '<div class="sh-act">' +
    '<button class="btn go" type="button" id="sh-go"' + (f ? '' : ' disabled') + '>' + (canFile ? 'share image' : 'save image') + '</button>' +
    (canFile ? '<button class="btn ghost" type="button" id="sh-save">save image</button>' : '') +
    '<button class="btn ghost" type="button" id="sh-text">copy the text</button></div>';
  body.querySelectorAll('[data-size]').forEach(function (b) {
    b.addEventListener('click', function () { SH.size = b.getAttribute('data-size'); renderShare(); });
  });
  $('sh-go').addEventListener('click', function () {
    var file = SH.files[SH.size];
    if (!file) return;
    if (canShareFile(file)) {
      navigator.share({ files: [file], text: SH.text }).catch(function (e) {
        if (e && e.name === 'AbortError') return;
        saveFile(file);
      });
    } else saveFile(file);
  });
  if ($('sh-save')) $('sh-save').addEventListener('click', function () { if (SH.files[SH.size]) saveFile(SH.files[SH.size]); });
  $('sh-text').addEventListener('click', function () { copyText(SH.text); });
}

/* ---- the board: its own screen, from a button ------------------------------------------------- */
var boardFrom = 's-home';
function showBoard() {
  var cur = document.body.dataset.screen;
  if (cur && cur !== 's-board' && cur !== 's-mound') boardFrom = cur;
  if (MN.isOpen()) MN.close(true);
  show('s-board');
  window.STD_BOARD.load();
}
/* a daily finished signed out is posted when you sign in: finishOuting posts it once */
function postIfOwed() {
  var A = window.STD_AUTH, st = {};
  try { st = (A && A.state && A.state()) || {}; } catch (e) {}
  if (!st.signedIn || !S.daily || S.daily.status !== 'over' || (S.dailyResult && S.dailyResult.account)) return null;
  return API.finishOuting(S.daily.outingId).then(function (r) { S.dailyResult = r; if (S.mode === 'daily' && S.result) S.result = r; });
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
      if (document.body.dataset.screen === 's-board') window.STD_BOARD.load();
      if (document.body.dataset.screen === 's-result' && S.result) renderModes();
      if (document.body.dataset.screen === 's-surv' && MU) MU.showSurvivor();
      if (MU) MU.entitlements().then(function (e) { MN.init({ ent: e }); });
    });
  } catch (e) {}
  /* a daily played signed out, posted on the sign-in (api.js claim): say where it landed */
  window.addEventListener('std-claimed', function (e) {
    var acct = e.detail && e.detail.account;
    if (!acct || !S.dailyResult) return;
    S.dailyResult.account = acct;
    S.saved = true;
    if (S.mode === 'daily') S.result = S.dailyResult;
    if (MN.current() === 'sheet-auth') MN.close(true);
    if (document.body.dataset.screen === 's-result') { renderStreak(); renderModes(); }
    if (document.body.dataset.screen === 's-board') window.STD_BOARD.load();
  });
  $('r-vote-go').addEventListener('click', jumpToVote);
  if (MU) MU.init({
    onVote: voteRow,
    signIn: function () { MN.show('auth'); },
    onSurvivor: startSurvivor,
    onBack: function () { renderHomeState(); show('s-home'); drawHero(); },
  });
  $('h-surv').addEventListener('click', openSurvivor);
  window.STD_BOARD.init({
    day: S.day, before: postIfOwed,
    played: function () { return !!S.dailyResult; },
    onBack: function () { show(boardFrom); if (boardFrom === 's-home') { renderHomeState(); drawHero(); } },
    onSignIn: function () { MN.show('auth'); },
    onPlay: function () { show('s-home'); takeMound(); },
    pending: function () { return API.pending ? API.pending() : null; },
    saveLabel: MU ? MU.SAVE_LABEL : null,
  });
  MN.init({
    hist: hist, today: S.day, prefs: prefs, board: showBoard, onArchive: playArchive,
    archiveDays: MU ? MU.archiveDays : null,
    onPref: function (k, v) {
      if (k === 'theme') { setTheme(v); return; }
      prefs[k] = v; savePrefs();
      if (k === 'sound' && v) sound('pop');
      if (k === 'meter') speedLabels();
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
  $('r-board').addEventListener('click', showBoard);
  initResultNav();
  /* the club table is a module (index.html): when it lands after the home screen, draw the matchup again */
  window.addEventListener('std-clubs', function () { if (S.scn && !$('h-main').hidden) renderMatchup(); });

  if (MU) MU.entitlements().then(function (e) { MN.init({ ent: e }); });
  API.getScenario(S.day).then(function (scn) {
    S.scn = scn;
    S.dailyScn = scn;
    MN.init({ scn: scn });
    window.STD_BOARD.init({ scn: scn });
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
