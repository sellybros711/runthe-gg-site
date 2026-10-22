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
  day: C.easternDay(), scn: null, daily: null, dailyResult: null,
  outing: null, mode: 'daily', type: null, cell: null, busy: false,
  heat: 'damage', scout: false, guide: null, hover: null, scene: null, grid: null, mini: null, hero: null, result: null,
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
  var tag = function (t) { return '<span class="mu-team"><i class="mu-bar"' + clubStyle(t) + '></i>' + esc(t.name) + '</span>'; };
  if (c.them) {
    var away = sit.usHome ? c.them : c.us, home = sit.usHome ? c.us : c.them;
    $('h-head').innerHTML = tag(away) + '<span class="mu-home"><span class="mu-at">at</span>' + tag(home) + '</span>';
  } else $('h-head').innerHTML = tag(c.us);
  $('h-sit').innerHTML = homeBug(s, c);
  $('h-sit').setAttribute('aria-label', situationLine(sit));
  var due = $('h-due').querySelector('.dc-band');
  if (due) { due.setAttribute('style', clubStyle(c.them).replace(/^ style="|"$/g, '')); due.querySelector('.dc-club').textContent = c.them ? c.them.full.toLowerCase() : 'the lineup'; }
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
  var s = S.scn, sit = s.situation, p = s.pitcher;
  /* the chips: only what the pack has. A null number or day is left out, never printed as "#" */
  var chips = ['<span class="chip-s hot">real save</span>'];
  if (s.preview) chips.push('<span class="chip-s">preview \u00b7 launch 26 oct</span>');
  else if (s.number != null) chips.push('<span class="chip-s">#' + esc(s.number) + ' \u00b7 today</span>');
  if (s.day) chips.push('<span class="chip-s">' + esc(fmtDay(s.day)) + '</span>');
  if (s.resolution === 'proxy') chips.push('<span class="chip-s quiet">modern pitch data</span>');
  $('h-day').innerHTML = chips.join('');
  $('h-title').textContent = occasionOf(s.title);
  var mo = MOMENT[s.id];
  $('h-moment').textContent = mo || '';
  $('h-moment').hidden = !mo;
  $('h-setup').innerHTML = '<i class="st-mark" aria-hidden="true"></i><span>' + esc(stakesOf(s.setup) || s.setup) + '</span>';
  var ordered = p.arsenal.slice().sort(function (a, b) { return b.usage - a.usage; });
  var ars = ordered.map(function (a, i) {
    return '<li><i class="dot" style="background:' + PITCH_COLORS[i % PITCH_COLORS.length] + '"></i><span class="an">' + esc(a.name) + '</span>' +
      '<span class="av">' + esc(a.velo.toFixed(1)) + '</span><span class="ap">' + esc(pct(a.usage)) + '</span></li>';
  }).join('');
  var chart = breakChart(ordered, p.throws);
  var meta = [p.team, p.year].filter(Boolean).map(esc).join(' \u00b7 ');
  $('h-pitcher').innerHTML =
    '<div class="dc-band"' + clubStyle({ pri: p.teamColors[0], sec: p.teamColors[1] }) + '>' +
    '<p class="dc-lbl">you pitch as</p><p class="pc-name">' + esc(p.name) + '</p>' +
    '<p class="dc-meta"><span>' + meta + '</span>' + (p.throws ? '<em class="dc-tag">throws ' + esc(handWord(p.throws)) + '</em>' : '') + '</p></div>' +
    '<div class="dc-body"><p class="dc-h"><b>his arsenal</b><span>mph \u00b7 usage</span></p>' +
    '<div class="pc-body' + (chart ? '' : ' flat') + '">' + (chart ? '<div class="brk">' + chart + '</div>' : '') + '<ul class="ars">' + ars + '</ul></div></div>';
  var due = s.batters.slice(0, 3).map(function (b, i) {
    var lp = lineParts(b.line);
    var stats = lp ? '<span class="du-slash">' + esc(lp.slash) + '</span>' + (lp.hr != null ? '<span class="du-hr"><b>' + esc(lp.hr) + '</b> hr</span>' : '')
      : '<span class="du-slash">' + esc(b.line || '') + '</span>';
    return '<li' + (i === 0 ? ' class="now"' : '') + '><span class="du-n">' + (i + 1) + '</span>' +
      '<span class="du-who"><b>' + esc(b.name) + '</b>' + (b.bats ? '<em class="hand">' + esc(b.bats) + '</em>' : '') +
      (i === 0 ? '<em class="du-now">at the plate</em>' : '') + '</span><span class="du-stats">' + stats + '</span></li>';
  }).join('');
  $('h-due').innerHTML = '<div class="dc-band"><p class="dc-lbl">you face</p><p class="pc-name dc-club"></p><p class="dc-meta"><span>due up, the real order</span></p></div>' +
    '<ol class="du">' + due + '</ol>';
  renderMatchup();
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
    return { on: on, svg: '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rad.toFixed(1) + '" fill="' + PITCH_COLORS[i % PITCH_COLORS.length] + '" fill-opacity="' + op + '"' + ring + '><title>' + esc(a.name) + '</title></circle>' };
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
  var d = S.daily, r = S.dailyResult;
  var take = $('b-take');
  if (r) {
    $('h-go').hidden = true;
    $('h-setup').hidden = true;
    var done = $('h-done');
    done.hidden = false;
    var dp = Math.round(r.percentile);
    done.innerHTML =
      '<div class="d-top"><div><p class="dc-lbl">today · #' + esc(S.scn.number) + '</p><p class="d-out ' + r.outcome + '">' + esc(C.OUTCOME_LABEL[r.outcome]) + '</p></div>' +
      (r.vsReal ? '<span class="vs-pill ' + esc(r.vsReal) + '">' + esc(VS_SHORT[r.vsReal]) + '</span>' : '') + '</div>' +
      '<div class="d-mid"><div class="strip">' + stripHTML(r.strip) + '</div>' +
      '<div class="d-stats"><span><b>' + esc(r.pitches) + '</b> ' + (r.pitches === 1 ? 'pitch' : 'pitches') + '</span>' +
      '<span><b>' + esc(dp) + '<sup>' + ordSuffix(dp) + '</sup></b> of closers</span></div></div>' +
      '<div class="d-act"><button class="btn take sm" type="button" id="d-see">see it again</button>' +
      '<button class="btn dk" type="button" id="d-share">share</button>' +
      '<button class="btn dk" type="button" id="d-again">run it back</button></div>' +
      '<p class="d-tmrw">back tomorrow for #' + esc(S.scn.number + 1) + '.</p>';
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
  /* the grid sits over the canvas, under the mini map and the dot key */
  $('m-scene').insertBefore(S.grid.el, $('m-dbg'));
  /* the live field minimap: built into its slot, shown after the first play of the outing */
  S.mini = window.STD_MINIMAP ? window.STD_MINIMAP.create($('m-mini')) : null;
  var ars = $('m-arsenal');
  ars.innerHTML = '';
  ars.dataset.n = S.scn.pitcher.arsenal.length;
  var big = maxBreak(S.scn.pitcher.arsenal);
  S.scn.pitcher.arsenal.forEach(function (a, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pitch';
    b.dataset.type = a.type;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<b>' + esc(a.name) + '</b><span>' + breakGlyph(a, colorOf(a), big) + esc(Math.round(a.velo)) + ' · ' + esc(pct(a.usage)) + '</span>';
    var held = holdToLearn(b, a.type);
    b.addEventListener('click', function () { if (!held()) pickType(a.type); });
    ars.appendChild(b);
  });
  /* the grid: a mouse over a cell shows the path to it (a touch has no hover, the tap picks it) */
  S.grid.cells.forEach(function (el, i) {
    el.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'mouse') return; S.hover = i; drawPreview(); });
    el.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'mouse') return; if (S.hover === i) { S.hover = null; drawPreview(); } });
  });
  $('m-throw').addEventListener('click', throwIt);
  S.meter = METER && $('m-meter') ? METER.create($('m-meter')) : null;
  $('m-batter').addEventListener('click', toggleScout);
  $('m-guide-b').addEventListener('click', function () { setGuide(S.guide ? null : S.type || S.scn.pitcher.arsenal[0].type); });
  $('m-guide').addEventListener('click', function (e) {
    if (e.target.closest('.gd-x')) setGuide(null);
  });
  $('m-heat').addEventListener('click', function (e) {
    var x = e.target.closest('[data-heat]');
    if (!x) return;
    S.heat = x.dataset.heat;
    renderScout();
  });
  window.addEventListener('resize', function () { if (document.body.dataset.screen === 's-mound') relayout(); if (S.hero) drawHero(); });
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

function relayout() {
  S.scene.layout();
  S.grid.place(S.scene.gridRect());
  S.scene.draw(idleFrame());
  drawPreview();
  renderGuide();
}
function idleFrame() {
  return { pitcher: 'set', batter: 'stance', umpire: 'set', mitt: S.cell != null ? S.scene.cellCenter(S.cell) : null, marker: S.lastMarker || null };
}

function enterMound() {
  buildMound();
  stopMeter(); meterDone();
  S.scene.setScenario(S.scn);
  S.type = null; S.cell = null; S.lastMarker = null;
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
  S.scene.setBatter(b);
  S.grid.setHand(b.bats);
  $('m-bname').textContent = b.name;
  $('m-bhand').textContent = 'bats ' + handWord(b.bats);
  $('m-bline').textContent = b.line;
  relayout();
  renderScout();
  if (!first) pbp(isTied(S.outing) ? 'tied' : '', b.name + ' up.');
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
  var sit = S.scn.situation;
  setClub($('m-usclub'), S.scn.pitcher.teamColors);
  // the hitters' club, from the same rule the 3D kit uses (clubs.js, loaded by index.html); grey until it is
  var them = window.STD_BATTING_CLUB ? window.STD_BATTING_CLUB({ title: S.scn.title, scenarioId: S.scn.id, pitcher: S.scn.pitcher }) : null;
  setClub($('m-themclub'), them ? [them.pri, them.sec] : null);
  var usName = closerName(S.scn.pitcher), themName = them ? (them.as || them.nick) : '';
  $('m-usname').textContent = usName || 'us';
  $('m-themname').textContent = themName ? themName.toUpperCase() : 'them';
  $('m-usname').title = usName ? S.scn.pitcher.team : '';
  $('m-themname').title = them ? (them.city + ' ' + them.nick) : '';
  S.grid.setPitches(st.log, paStart(st.log));
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
function pickCell(c) {
  if (S.busy) return;
  stopMeter();
  S.cell = c;
  S.grid.setSelected(c);
  S.lastMarker = null;
  S.grid.setMarks({});
  if (S.scene.setTarget) S.scene.setTarget(c);
  S.scene.draw(idleFrame());
  drawPreview();
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
  S.scout = !S.scout;
  if (S.scout && S.guide) setGuide(null);
  renderScout();
}

/* The heat map is always on the grid (S.heat is its mode); the scout card is the reading of
   the hitter, opened by the batter bar. It is a sheet over the lower HUD, under the grid. */
function renderScout() {
  var b = batterAt(S.outing.batterIndex), box = $('m-scout');
  /* rules 2: the screen reads the scouting view (grade.js scoutView: the chase area in four quadrants,
     values in steps), never the exact profile the engine plays */
  var G = window.STD_GRADE, view = G && G.scoutView && S.outing.rules >= 2 ? G.scoutView(b.profile) : b.profile;
  S.grid.setHeat(view, S.heat);
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
  /* a sheet over the lower HUD: it stops just under the grid's last row, so the zone is never covered */
  var gb = S.grid.el.getBoundingClientRect().bottom, sb = $('s-mound').getBoundingClientRect().bottom;
  box.style.maxHeight = Math.max(120, sb - gb - 12) + 'px';
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
   The break preview (a ghost trail from the hand to the spot, drawn by the 3D stage, and the same
   path as a thin line on the grid), the glyph on each pitch button and the pitch guide. All of it
   comes from the arsenal's own numbers: velo, pfxX and pfxZ (catcher's view inches, so mirrored on
   screen like the grid), usage, and the shape from the contract. The preview is the aim, never
   the outcome: it ends on the cell's centre, wherever the engine's command draw puts the ball. */

/* the colour a pitch has on the break chart (usage order), so the buttons and the chart agree */
function colorOf(a) {
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
  var cell = S.hover != null ? S.hover : S.cell;
  var live = S.type && !S.busy && S.outing && S.outing.status === 'live';
  var spec = live ? { type: S.type, cell: cell == null ? 12 : cell } : null;
  if (S.scene.setPreview) S.scene.setPreview(spec);
  var svg = gridLine(), pp = spec && S.scene.previewPoints ? S.scene.previewPoints() : null;
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
  var nums = '<span><b>' + esc(a.velo.toFixed(1)) + '</b>mph</span>';
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
  /* at the top of the field, over the stands, and off the grid when the screen has the room */
  var host = $('s-mound').getBoundingClientRect(), sc = $('m-scene').getBoundingClientRect();
  var gt = S.grid.el.getBoundingClientRect().top;
  box.style.top = (sc.top - host.top + 4) + 'px';
  box.style.maxHeight = Math.max(118, gt - sc.top - 8) + 'px';
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
  if (!meterOn()) return fire({ type: S.type, cell: S.cell });
  if (S.meter.running()) return;
  audio();
  var ap = pitchOf(S.type), bt = batterAt(S.outing.batterIndex);
  var type = S.type, cell = S.cell;
  $('m-throw').hidden = true;
  S.meter.run({
    command: ap.command, practice: S.mode === 'practice', repeat: repeatOf(type),
    verb: S.outing.shutItLive ? 'shut it' : 'release',
    label: ap.name + ' \u00b7 ' + M.cellWords(cell, bt.bats),
    hint: 'tap on the mark',
    onSnap: function () { sound('snap'); try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} },
  }).then(function (r) {
    if (!r) { $('m-throw').hidden = false; updateThrow(); return; }
    fire({ type: type, cell: cell, q: r.q });
  });
}
/* rules 2: how many pitches in a row before this one were this type (a good release helps less on a repeat) */
function repeatOf(type) {
  var log = (S.outing && S.outing.rules >= 2 && S.outing.log) || [], n = 0;
  for (var i = log.length - 1; i >= 0 && log[i].call.type === type; i--) n++;
  return n;
}
function meterDone() { if (S.meter) S.meter.hide(); $('m-throw').hidden = false; }
/* the ball landed in the cell that was called: a quiet ring on that cell, after the play */
function paintedCue(pr) {
  if (pr.actualCell !== pr.call.cell || !S.grid || !S.grid.cells) return;
  var c = S.grid.cells[pr.call.cell];
  if (!c) return;
  c.classList.remove('m-painted'); void c.offsetWidth; c.classList.add('m-painted');
  setTimeout(function () { c.classList.remove('m-painted'); }, 1400);
}
function fire(call) {
  if (S.busy) return;
  S.busy = true;
  audio();
  updateThrow();
  S.grid.setDisabled(true);
  var scoutWas = S.scout, guideWas = S.guide;
  if (S.scout) { S.scout = false; renderScout(); }
  if (S.guide) setGuide(null);
  S.hover = null;
  drawPreview();
  $('m-scene').classList.add('flying');
  API.throwPitch(S.outing.outingId, call).then(function (res) {
    var pr = res.pitchResult, batter = batterAt(S.outing.batterIndex);
    var opts = {
      pr: pr, ap: pitchOf(pr.call.type), quick: !!prefs.quick,
      hooks: { call: function () { var t = playText(pr, batter, res.state); pbp(t.tag, t.rest + (pr.actualCell === pr.call.cell ? ' \u00b7 painted' : '')); }, sound: sound, field: hudRunners },
    };
    return (S.scene.is3d ? S.scene.play(opts) : AN.play(S.scene, opts)).then(function () {
      S.lastMarker = S.scene.toScreen(pr.actual);
      $('m-scene').classList.remove('flying');
      S.grid.setMarks({ target: pr.call.cell });
      paintedCue(pr);
      meterDone();
      hudRunners(null);
      renderHud(res.state);
      if (S.mini) S.mini.show(pr);
      S.outing = res.state;
      S.busy = false;
      S.grid.setDisabled(false);
      S.grid.setSelected(null);
      S.cell = null; S.type = null;
      document.querySelectorAll('#m-arsenal .pitch').forEach(function (b) { b.classList.remove('sel'); b.setAttribute('aria-pressed', 'false'); });
      if (S.outing.status === 'over') return finish();
      if (S.scene.setTarget) S.scene.setTarget(null);
      if (pr.paOver) { S.lastMarker = null; S.grid.setMarks({}); setBatter(false); } else S.scene.draw(idleFrame());
      if (scoutWas) { S.scout = true; renderScout(); }
      if (guideWas) setGuide(guideWas);
      updateThrow();
      if (S.sizeDue) { S.sizeDue = false; relayout(); } else drawPreview();
      renderHud(S.outing);
    });
  }).catch(function (e) {
    S.busy = false;
    meterDone();
    S.grid.setDisabled(false);
    $('m-scene').classList.remove('flying');
    if (guideWas) setGuide(guideWas);
    drawPreview();
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

/* runs allowed: the result's own, or the outing's score against the spot's */
function runsOf(r, st) { return r.runs != null ? r.runs : st && st.score ? st.score.them - S.scn.situation.score.them : null; }

function renderResult() {
  var r = S.result, s = S.scn, st = S.mode === 'daily' ? S.daily || S.outing : S.outing;
  var runs = runsOf(r, st);
  $('r-eyebrow').textContent = S.mode === 'practice' ? 'practice \u00b7 not scored' : (s.preview ? 'preview' : '#' + s.number) + ' \u00b7 final \u00b7 ' + s.title.toLowerCase();
  var o = $('r-outcome');
  o.textContent = C.OUTCOME_LABEL[r.outcome];
  o.className = 'outcome ' + r.outcome;
  $('r-hero').className = 'r-hero ' + r.outcome;
  var p = Math.round(r.percentile);
  $('r-line').innerHTML =
    '<span class="fact"><b>' + esc(r.pitches) + '</b>' + (r.pitches === 1 ? 'pitch' : 'pitches') + '</span>' +
    (runs != null ? '<span class="fact"><b>' + esc(runs) + '</b>' + (runs === 1 ? 'run' : 'runs') + '</span>' : '');
  $('r-npitch').textContent = r.pitches + (r.pitches === 1 ? ' pitch' : ' pitches');
  $('r-strip').innerHTML = stripHTML(r.strip, true);
  var WORD = { green: 'the call', yellow: 'close', orange: 'costly', red: 'wrong idea' };
  $('r-legend').innerHTML = C.BANDS.map(function (b) { return '<span><i class="sq ' + b.band + '"></i>' + WORD[b.band] + '</span>'; }).join('');
  $('r-pct').innerHTML = p + '<sup>' + ordSuffix(p) + '</sup>';
  $('r-pctline').innerHTML = 'better than <b>' + esc(p) + '%</b> of the closer pool in this spot.';
  $('r-score').textContent = r.score != null ? 'score ' + r.score : '';
  $('r-chart').innerHTML = poolChart(r);
  $('r-like').textContent = r.pitchedLike ? r.pitchedLike.name : '-';
  $('r-why').textContent = r.pitchedLike ? r.pitchedLike.reason : '';
  var rv = r.reveal || {}, his = lastName(s.pitcher.name);
  $('r-real').className = 'vsbar ' + (r.vsReal || 'none');
  $('r-real').innerHTML = '<div class="vs-t"><small>you vs the real ' + esc(his.toLowerCase()) + '</small>' +
    '<b class="vs ' + esc(r.vsReal) + '">' + esc(vsHead(r.vsReal, his)) + '</b>' +
    '<span>' + esc(vsWhy(r, rv, runs)) + '</span></div>';
  $('r-reveal').innerHTML = compareCard(r, rv, runs, st);
  $('r-share').hidden = S.mode !== 'daily';
  $('r-tomorrow').textContent = S.mode === 'daily' ? 'back tomorrow for #' + (s.number + 1) + '.' : '';
  renderStreak();
}

/* ---- you against the real pitcher ------------------------------------------------------------
   The verdict is the engine's (vsReal: the outcome, then runs, then pitches when his count is
   known). The line under it says which of the three decided it, in the result's own numbers. */
var VS_SHORT = { beat: 'beat him', matched: 'matched him', lost: 'he won' };
function vsHead(v, his) {
  return v === 'beat' ? 'you beat ' + his : v === 'matched' ? 'you matched ' + his : v === 'lost' ? his + ' did better' : '-';
}
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
function vsWhy(r, rv, runs) {
  var mine = (C.OUTCOME_LABEL[r.outcome] || '').toLowerCase(), hisOut = (C.OUTCOME_LABEL[rv.outcome] || '').toLowerCase();
  if (r.outcome !== rv.outcome) return mine + ' to his ' + hisOut + '.';
  var a = mine + ' both times.';
  if (runs == null || rv.runs == null) return a;
  if (runs !== rv.runs) return a + ' ' + plural(runs, 'run', 'runs') + ' to his ' + rv.runs + '.';
  a += ' ' + plural(runs, 'run', 'runs') + ' each.';
  if (typeof rv.pitches !== 'number') return a + ' his pitch count is not on record.';
  if (r.pitches === rv.pitches) return a + ' ' + plural(r.pitches, 'pitch', 'pitches') + ' each.';
  return a + ' ' + plural(r.pitches, 'pitch', 'pitches') + ' to his ' + rv.pitches + '.';
}

/* Your plate appearances from the outing's log: one per batter, in order. The word is the play by
   play's tag on the pitch that ended it. */
function myPAs(log) {
  var out = [], start = 0, bi = 0, runs = 0;
  (log || []).forEach(function (pr, i) {
    runs += pr.runs || 0;
    if (!pr.paOver && i < log.length - 1) return;
    var b = batterAt(bi);
    out.push({ batter: b.name, word: playText(pr, b).tag, pitches: i - start + 1, runs: runs });
    start = i + 1; runs = 0;
    if (pr.paOver) bi++;
  });
  return out;
}

/* Two columns, you and him. The outcome, runs and pitches, then one row per batter faced in the
   real order. A batter one side never faced is a quiet dash. Only an unambiguous edge is marked:
   the better outcome, fewer runs, fewer pitches. A plate appearance is never judged. */
function compareCard(r, rv, runs, st) {
  var s = S.scn, his = lastName(s.pitcher.name);
  var none = '<span class="v none">-</span>';
  var cell = function (html, win, cls) { return '<span class="v' + (cls ? ' ' + cls : '') + (win ? ' win' : '') + '">' + html + '</span>'; };
  var row = function (k, a, b) { return '<div class="cmp-row"><span class="k">' + k + '</span>' + a + b + '</div>'; };
  var rk = C.OUTCOME_RANK, mineO = rk[r.outcome], hisO = rk[rv.outcome];
  var hp = typeof rv.pitches === 'number' ? rv.pitches : null;
  var rows =
    row('result', cell('<b class="o ' + esc(r.outcome) + '">' + esc((C.OUTCOME_LABEL[r.outcome] || '').toLowerCase()) + '</b>', mineO > hisO),
      rv.outcome ? cell('<b class="o ' + esc(rv.outcome) + '">' + esc((C.OUTCOME_LABEL[rv.outcome] || '').toLowerCase()) + '</b>', hisO > mineO) : none) +
    row('runs', runs == null ? none : cell('<b>' + esc(runs) + '</b>', rv.runs != null && runs < rv.runs),
      rv.runs == null ? none : cell('<b>' + esc(rv.runs) + '</b>', runs != null && rv.runs < runs)) +
    row('pitches', cell('<b>' + esc(r.pitches) + '</b>', hp != null && r.pitches < hp),
      hp != null ? cell('<b>' + esc(hp) + '</b>', hp < r.pitches) : cell(esc(rv.pitchesNote || 'not on record'), false, 'note'));
  var mine = myPAs(st && st.log), real = rv.plateAppearances || [];
  var n = Math.max(mine.length, real.length), bats = '';
  for (var i = 0; i < n; i++) {
    var a = mine[i], b = real[i], name = a ? a.batter : b.batter;
    var side = function (pa, word) {
      if (!pa) return none;
      return '<span class="v">' + esc(word) + (pa.pitches != null ? '<small>' + plural(pa.pitches, 'pitch', 'pitches') + '</small>' : '') + '</span>';
    };
    bats += '<div class="cmp-bat"><span class="k"><i>' + (i + 1) + '</i></span><b class="nm">' + esc(name) + '</b>' +
      side(a, a && a.word) + side(b, b && b.result) + '</div>';
  }
  return '<div class="cmp-h"><b>you vs the real one</b><span>side by side</span></div>' +
    '<div class="cmp-row cmp-head"><span class="k"></span><span class="who you">you</span><span class="who him">' + esc(his) + '</span></div>' +
    rows + (bats ? '<p class="cmp-sub">batter by batter</p>' + bats : '') +
    (rv.summary ? '<p class="cmp-sum"><b>his night</b> ' + esc(rv.summary) + '.</p>' : '');
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
  var s = S.scn, st = S.daily || S.outing, his = lastName(s.pitcher.name);
  var rv = r.reveal || {};
  return {
    outcome: r.outcome, strip: r.strip || [], pitches: r.pitches, percentile: r.percentile,
    label: s.preview ? 'preview' : '#' + s.number, title: s.title,
    vsReal: r.vsReal || null, vsLabel: 'you vs the real ' + his.toLowerCase(),
    vsHead: r.vsReal ? vsHead(r.vsReal, his) : null, vsWhy: r.vsReal && rv.outcome ? vsWhy(r, rv, runsOf(r, st)) : null,
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
    });
  } catch (e) {}
  window.STD_BOARD.init({
    day: S.day, before: postIfOwed,
    played: function () { return !!S.dailyResult; },
    onBack: function () { show(boardFrom); if (boardFrom === 's-home') { renderHomeState(); drawHero(); } },
    onSignIn: function () { MN.show('auth'); },
    onPlay: function () { show('s-home'); takeMound(); },
  });
  MN.init({
    hist: hist, today: S.day, prefs: prefs, board: showBoard,
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
  $('r-board').addEventListener('click', showBoard);
  /* the club table is a module (index.html): when it lands after the home screen, draw the matchup again */
  window.addEventListener('std-clubs', function () { if (S.scn && !$('h-main').hidden) renderMatchup(); });

  API.getScenario(S.day).then(function (scn) {
    S.scn = scn;
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
