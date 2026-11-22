/* voices.js: the voice of the ump. window.STD_VOICES.
 *
 * Players record (or upload) an umpire's call from a script. A tester shortlists or rejects it, the
 * owner puts a shortlisted call in the game (supabase/177), and the game plays a random live
 * ('approved') clip for that call (sound.js ump()). The server is supabase/165 to 177; auth.js
 * makes the calls.
 *
 * The rules it keeps:
 * - The record sheet opens from a button (the home's list, the result's row, settings); the review
 *   sheet from its button in settings. Nothing here opens by itself.
 * - Signed in only. Signed out the sheet shows the sign-in button, as the rest of the game does.
 * - The mic is asked for only on the record tap (getUserMedia), with the browser's own codec.
 *   A take stops itself at MAX_MS. An upload longer than MAX_MS, bigger than MAX_BYTES, or not an
 *   audio type is refused (the bucket and the table refuse it too).
 * - The consent is ticked before the first send of a session (sessionStorage), and its exact text
 *   and version go on every row. The
 *   server compares the text word for word with its own copy (shutdoor_ump_consent).
 * - The review sheet is the testers' (any stumpire_testers row, the owner's 'admin' included,
 *   supabase/176); its button shows only when the server says so, and every call behind it checks
 *   again. A tester's Approve is a shortlist; only the owner puts a call in the game (177). A
 *   reject deletes the audio for good (175), so it asks first, inside the sheet.
 * - One voice an outing (the owner, 2026-11-19): at each outing's start one player's live clips are
 *   picked (pickVoice) and only theirs play; a line they lack gets the game's own ump, never another
 *   player's clip. A few of that voice's clips are preloaded once the mound is up, after a beat, and
 *   only while the sound is on. A call never waits for a clip: a line with none stays silent.
 *
 * The pure parts (the script, the consent, the checks, the call map, the preload plan) are exported
 * for node (test/voices.mjs). */
(function () {
'use strict';
var NODE = typeof module !== 'undefined' && module.exports;

var LINES = [
  { id: 'strike', text: 'Strike!' },
  { id: 'strike3', text: 'Strike three!' },
  { id: 'ball', text: 'Ball!', hint: 'Low and short.' },
  { id: 'ball4', text: 'Ball four, take your base!' },
  { id: 'out', text: 'Out!' },
  { id: 'yer_out', text: 'Yer out!' },
  { id: 'safe', text: 'Safe!' },
  { id: 'foul', text: 'Foul ball!' },
  { id: 'time', text: 'Time!' },
  { id: 'play_ball', text: 'Play ball!' },
  { id: 'steerike', text: 'Steee-rike!', hint: 'The long one. Drag it out.' },
  { id: 'thats_a_strike', text: 'That\'s a strike!', hint: 'The challenge went your way.' },
];
var CONSENT_V = 1;
var CONSENT = 'I recorded this myself. I\'m 18 or older. I give Run The Games permission to use, edit and play this recording in its games, for free and forever.';
var MAX_MS = 3000, MAX_BYTES = 307200, MIN_MS = 150, CREDIT_MAX = 30, PENDING_MAX = 40;
var MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a'];
var EXT = { webm: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac' };
/* the game's calls (ui.js) to the lines that can answer them */
var CALLS = {
  strike: ['strike'], k: ['strike3', 'steerike'], ball: ['ball'], ball4: ['ball4'], foul: ['foul'],
  out: ['out', 'yer_out'], safe: ['safe'], time: ['time'], play: ['play_ball'], overturn: ['thats_a_strike'],
};
var PER_LINE = 2;

function lineOf(id) { for (var i = 0; i < LINES.length; i++) if (LINES[i].id === id) return LINES[i]; return null; }
/* 'audio/webm;codecs=opus' is audio/webm. A file with no type is read off its name. */
function baseMime(type, name) {
  var t = String(type || '').split(';')[0].trim().toLowerCase();
  if (t === 'audio/x-wav' || t === 'audio/wave' || t === 'audio/vnd.wave') t = 'audio/wav';
  if (t === 'audio/x-m4a' || t === 'audio/m4a') t = 'audio/mp4';
  if (!t && name) { var m = /\.([a-z0-9]+)$/i.exec(String(name)); if (m) t = EXT[m[1].toLowerCase()] || ''; }
  return t;
}
/* null when the clip can go, else what the player reads */
function check(c) {
  if (!c || MIMES.indexOf(baseMime(c.mime)) < 0) return 'Audio files only.';
  if (!(c.bytes > 0) || !(c.ms >= MIN_MS)) return 'That one came out empty. Try again.';
  if (c.ms > MAX_MS + 50) return 'Too long. Keep it under ' + MAX_MS / 1000 + ' seconds.';
  if (c.bytes > MAX_BYTES) return 'Too big. Keep it under ' + Math.round(MAX_BYTES / 1024) + ' KB.';
  return null;
}
/* the recorder's type: the first the browser can make, or '' to let it choose */
function recorderMime(supported) {
  var want = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  for (var i = 0; i < want.length; i++) { try { if (supported(want[i])) return want[i]; } catch (e) {} }
  return '';
}
function cleanCredit(s) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CREDIT_MAX); }
function linesFor(word) { return CALLS[word] || []; }
/* which approved clips to fetch: up to PER_LINE a line, chosen at random; with a voice, only its clips */
function plan(list, perLine, rand, voice) {
  rand = rand || Math.random; perLine = perLine || PER_LINE;
  var by = {}, out = [];
  (list || []).forEach(function (c) {
    if (c && c.path && lineOf(c.line) && (voice == null || voiceOf(c) === voice)) (by[c.line] = by[c.line] || []).push(c);
  });
  Object.keys(by).forEach(function (k) {
    var a = by[k].slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    out = out.concat(a.slice(0, perLine));
  });
  return out;
}

/* the mic's refusal, by the error's name: the player's own block, no mic at all, or anything else */
function micError(name) {
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'none';
  return 'other';
}
var MIC_SAY = {
  denied: 'Your mic is blocked. Allow it in your browser settings, or upload a file.',
  none: 'No mic found. Upload a file instead.',
  other: 'The mic didn\'t start. Try again, or upload a file.',
  cannot: 'This browser can\'t record. Upload a file instead.',
};
/* a run of levels (0..1) to n bars, the loudest in each slice */
function peaks(lv, n) {
  lv = lv || []; var out = [];
  if (!lv.length) return out;
  for (var i = 0; i < n; i++) {
    var a = Math.floor(i * lv.length / n), b = Math.max(a + 1, Math.floor((i + 1) * lv.length / n)), m = 0;
    for (var k = a; k < b && k < lv.length; k++) if (lv[k] > m) m = lv[k];
    out.push(Math.max(0, Math.min(1, m)));
  }
  return out;
}
/* after a send: the next line not sent yet, after this one and then from the top, or -1 */
function nextOpen(sent, i) {
  for (var d = 1; d <= LINES.length; d++) { var k = (i + d) % LINES.length; if (!sent[LINES[k].id]) return k; }
  return -1;
}
/* the record sheet's way through the script (the owner, 2026-11-19: a tester on line 12 thought it was
   stuck). After a send: the next line not sent yet after this one, never wrapping; -1 is the end
   screen (the last line sent, or every line after it already sent). Skip: the next line; on the last
   line it is Finish, -1. A skip never sends anything. */
function afterSend(sent, i) {
  for (var k = i + 1; k < LINES.length; k++) if (!sent[LINES[k].id]) return k;
  return -1;
}
function afterSkip(i) { return i + 1 < LINES.length ? i + 1 : -1; }

/* ONE VOICE AN OUTING (the owner, 2026-11-19: never one person's "Strike!" then another's "Ball!").
   A clip's voice is its uploader, read off its storage path (<user id>/<clip id>.<ext>, the only
   folder 165's upload policy lets them write), an opaque key that is never shown. At an outing's
   start one voice is picked among the live clips: one that covers every line on the script if any
   does, else one with the most lines, ties broken by a draw seeded with the outing's id (so a resumed
   outing keeps its voice while the live set holds). A line the voice lacks gets the game's own ump
   (sound.js), never another voice's clip. */
function voiceOf(c) { var m = /^([^/]+)\/[^/]+$/.exec(String(c && c.path || '')); return m ? m[1] : null; }
function seeded(key) {
  var h = 2166136261;
  key = String(key);
  for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return function () { h = (h + 0x6d2b79f5) >>> 0; var t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* the voices in a live list: {voice: {line: true}} for the clips on the script with a file */
function voicesIn(list) {
  var by = {};
  (list || []).forEach(function (c) {
    var v = voiceOf(c);
    if (v && lineOf(c && c.line)) (by[v] = by[v] || {})[c.line] = true;
  });
  return by;
}
/* the voice for an outing, or null when nothing is live. key: the outing's id (a seeded tie break),
   or a function to draw with */
function pickVoice(list, key) {
  var by = voicesIn(list), names = Object.keys(by).sort();
  if (!names.length) return null;
  var n = function (v) { return Object.keys(by[v]).length; };
  var full = names.filter(function (v) { return n(v) === LINES.length; });
  var top = 0; names.forEach(function (v) { top = Math.max(top, n(v)); });
  var pool = full.length ? full : names.filter(function (v) { return n(v) === top; });
  var rand = typeof key === 'function' ? key : key != null ? seeded(key) : Math.random;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/* THE REVIEW SHEET'S FILTERS (the owner, 2026-11-19): Person and Call, together, on every tab. A
   person is the queue row's username (the queue names every row's uploader, a rejected one too, whose
   file and path are gone); a row with no username falls back to its voice (the path's folder), and
   one with neither is "No username". With a person picked their rows read in script order, with how
   many of the 12 lines they have live (one game plays one person's whole set). */
function personOf(x) {
  if (x && x.username) return 'u:' + x.username;
  var v = voiceOf(x);
  return v ? 'v:' + v : 'none';
}
function personLabel(key) {
  if (key.indexOf('u:') === 0) return '@' + key.slice(2);
  if (key.indexOf('v:') === 0) return 'No username (' + key.slice(2, 8) + ')';
  return 'No username';
}
/* [{key, label, n}] for the rows, by name */
function people(rows) {
  var by = {};
  (rows || []).forEach(function (x) { var k = personOf(x); by[k] = (by[k] || 0) + 1; });
  return Object.keys(by).map(function (k) { return { key: k, label: personLabel(k), n: by[k] }; })
    .sort(function (a, b) { return a.label.toLowerCase() < b.label.toLowerCase() ? -1 : a.label.toLowerCase() > b.label.toLowerCase() ? 1 : 0; });
}
function lineIndex(id) { for (var i = 0; i < LINES.length; i++) if (LINES[i].id === id) return i; return LINES.length; }
/* person and line: 'all' or a key; with a person, script order (then oldest first) */
function filterRows(rows, person, line) {
  var out = (rows || []).filter(function (x) {
    return (person === 'all' || personOf(x) === person) && (line === 'all' || (x && x.line) === line);
  });
  if (person !== 'all') out = out.slice().sort(function (a, b) {
    return lineIndex(a.line) - lineIndex(b.line) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
  return out;
}
/* the lines a person has live: {line: true}, from the Live list's rows */
function liveLinesOf(liveRows, person) {
  var out = {};
  (liveRows || []).forEach(function (x) { if (x && personOf(x) === person && lineOf(x.line)) out[x.line] = true; });
  return out;
}

var api = {
  API_VERSION: 1,
  LINES: LINES, CONSENT: CONSENT, CONSENT_V: CONSENT_V, MAX_MS: MAX_MS, MAX_BYTES: MAX_BYTES, MIMES: MIMES,
  CREDIT_MAX: CREDIT_MAX, PENDING_MAX: PENDING_MAX, CALLS: CALLS,
  lineOf: lineOf, baseMime: baseMime, check: check, recorderMime: recorderMime, cleanCredit: cleanCredit,
  linesFor: linesFor, plan: plan, micError: micError, MIC_SAY: MIC_SAY, peaks: peaks, nextOpen: nextOpen,
  afterSend: afterSend, afterSkip: afterSkip, voiceOf: voiceOf, voicesIn: voicesIn, pickVoice: pickVoice,
  personOf: personOf, personLabel: personLabel, people: people, filterRows: filterRows, liveLinesOf: liveLinesOf,
};
if (NODE) { module.exports = api; return; }

/* ============================ the page ============================ */

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function A() { return window.STD_AUTH || {}; }
function MN() { return window.STD_MENUS; }
function signedIn() { try { return !!(A().state && A().state().signedIn); } catch (e) { return false; } }

/* ---- the record sheet ---------------------------------------------------- */
/* A booth on a phone (the owner, 2026-11-17: "a red record button so it's clear"). One line at a
   time, big, with the 12 lines as dots. Three states: idle (the red button), recording (a pulsing
   ring that fills to the cap, a live level meter, the seconds left, a tap stops it), then the take
   (play it back, record again, send). Uploading a file is a quiet link, and the fallback when there
   is no mic. The consent is ticked once a session (sessionStorage) and its exact text and version
   still go on every row, as 165 checks. The sheet only ever opens from a button. */

/* done: the end screen is up. n: the calls sent since the page loaded (a redo counts again) */
var R = { i: 0, take: null, rec: null, consent: false, credit: '', busy: false, msg: '', mic: '', sent: {}, pending: null, src: '', done: false, n: 0 };
var CONSENT_KEY = 'std_vo_consent';
var BARS = 28;
try { R.consent = sessionStorage.getItem(CONSENT_KEY) === String(CONSENT_V); } catch (e) {}
function setConsent(on) {
  R.consent = !!on;
  try { if (on) sessionStorage.setItem(CONSENT_KEY, String(CONSENT_V)); else sessionStorage.removeItem(CONSENT_KEY); } catch (e) {}
}
function EVS() { return window.STD_EVENTS; }

/* the old take's URL goes a beat later, once its audio element has left the page (a revoke while it
   still loads is a console error) */
function dropTake() {
  var u = R.take && R.take.url;
  R.take = null;
  if (u) setTimeout(function () { try { URL.revokeObjectURL(u); } catch (e) {} }, 4000);
}
function stopRec(keep) {
  var r = R.rec; if (!r) return;
  R.rec = null;
  clearTimeout(r.timer); cancelAnimationFrame(r.raf);
  r.keep = keep !== false;
  try { if (r.mr.state !== 'inactive') r.mr.stop(); } catch (e) {}
  if (r.ac) { try { r.ac.close(); } catch (e) {} }
}
function closeMic(stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }

/* the live meter: an analyser on the mic, the level (RMS) each frame. Only for the eye: a browser
   with no Web Audio records the same take with a still meter */
function meterOn(rec, stream) {
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ac = new AC(), an = ac.createAnalyser();
    an.fftSize = 512;
    ac.createMediaStreamSource(stream).connect(an);
    if (ac.state === 'suspended' && ac.resume) ac.resume();
    rec.ac = ac; rec.an = an; rec.buf = new Uint8Array(an.fftSize);
  } catch (e) {}
}
function level(rec) {
  if (!rec.an) return 0;
  rec.an.getByteTimeDomainData(rec.buf);
  var s = 0;
  for (var i = 0; i < rec.buf.length; i++) { var v = (rec.buf[i] - 128) / 128; s += v * v; }
  return Math.min(1, Math.sqrt(s / rec.buf.length) * 4);
}
function drawBars(el, lv, upto) {
  if (!el) return;
  var b = el.children;
  for (var i = 0; i < b.length; i++) {
    var v = lv[i] == null ? 0 : lv[i];
    b[i].style.height = Math.max(8, Math.round(v * 100)) + '%';
    if (upto != null) b[i].classList.toggle('on', i < upto);
  }
}
function tickRec() {
  var r = R.rec; if (!r) return;
  var t = Math.min(MAX_MS, Date.now() - r.t0), left = Math.max(0, MAX_MS - t);
  r.lv.push(level(r));
  var tail = r.lv.slice(-BARS);
  while (tail.length < BARS) tail.unshift(0);
  drawBars($('vo-bars'), tail);
  var ring = $('vo-ring'); if (ring) ring.style.strokeDashoffset = String(100 - t / MAX_MS * 100);
  var s = $('vo-left'); if (s) s.textContent = (left / 1000).toFixed(1);
  r.raf = requestAnimationFrame(tickRec);
}

function startRec() {
  var md = navigator.mediaDevices;
  if (!md || !md.getUserMedia || typeof MediaRecorder === 'undefined') { R.mic = 'cannot'; R.msg = MIC_SAY.cannot; return render(); }
  dropTake(); R.msg = ''; R.mic = ''; render();
  md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } }).then(function (stream) {
    var type = recorderMime(function (t) { return MediaRecorder.isTypeSupported(t); });
    var mr;
    try { mr = type ? new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 64000 }) : new MediaRecorder(stream); }
    catch (e) { closeMic(stream); R.mic = 'cannot'; R.msg = MIC_SAY.cannot; return render(); }
    var parts = [], rec = { mr: mr, keep: true, timer: 0, raf: 0, t0: 0, lv: [] };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) parts.push(e.data); };
    mr.onstop = function () {
      closeMic(stream);
      var ms = Math.min(MAX_MS, Date.now() - rec.t0);
      if (rec.keep) {
        var blob = new Blob(parts, { type: mr.mimeType || type || 'audio/webm' });
        setTake(blob, ms, false, peaks(rec.lv, BARS));
      } else render();
    };
    meterOn(rec, stream);
    R.rec = rec;
    mr.start();
    rec.t0 = Date.now();
    rec.timer = setTimeout(function () { stopRec(true); }, MAX_MS);
    render();
    rec.raf = requestAnimationFrame(tickRec);
  }).catch(function (err) {
    R.mic = micError(err && err.name);
    R.msg = MIC_SAY[R.mic];
    render();
  });
}
function setTake(blob, ms, upload, lv) {
  dropTake();
  var mime = baseMime(blob.type, blob.name);
  var t = { blob: blob, mime: mime, bytes: blob.size, ms: Math.round(ms), url: URL.createObjectURL(blob), upload: upload, lv: lv || [] };
  var bad = check(t);
  if (bad) { try { URL.revokeObjectURL(t.url); } catch (e) {} R.msg = bad; return render(); }
  R.take = t; R.msg = '';
  render();
}
/* an upload: its length and its shape from decoding it, nothing played */
function fromFile(f) {
  if (!f) return;
  var mime = baseMime(f.type, f.name);
  var pre = check({ mime: mime, bytes: f.size, ms: MIN_MS });
  if (pre) { R.msg = pre; return render(); }
  var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  f.arrayBuffer().then(function (buf) {
    if (!Off) return null;
    var oc = new Off(1, 1, 44100);
    return new Promise(function (res, rej) { var p = oc.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
  }).then(function (ab) {
    if (!ab) { R.msg = 'That file won\'t play here. Try another.'; return render(); }
    var blob = mime === f.type ? f : new Blob([f], { type: mime });
    var d = ab.getChannelData(0), n = Math.min(d.length, 4096), step = d.length / n, a = [];
    for (var i = 0; i < n; i++) a.push(Math.min(1, Math.abs(d[Math.floor(i * step)]) * 2.2));
    setTake(blob, ab.duration * 1000, true, peaks(a, BARS));
  }).catch(function () { R.msg = 'That file won\'t play here. Try another.'; render(); });
}
function send() {
  var t = R.take, line = LINES[R.i];
  if (!t || !R.consent || R.busy || !A().umpSubmit) return;
  stopPlay();
  R.busy = true; R.msg = ''; render();
  A().umpSubmit({ line: line.id, blob: t.blob, mime: t.mime, bytes: t.bytes, ms: t.ms, credit: cleanCredit(R.credit), consent: CONSENT, consentVersion: CONSENT_V })
    .then(function (r) {
      R.busy = false;
      if (!r || r.error) { R.msg = r && r.error ? sentence(r.error) : 'That didn\'t send. Try again.'; return render(); }
      R.sent[line.id] = true;
      R.n++;
      if (R.pending != null) R.pending++;
      if (EVS() && EVS().voiceSent) EVS().voiceSent(line.id, t.upload ? 'upload' : 'record');
      dropTake();
      var next = afterSend(R.sent, R.i);
      if (next < 0) { R.msg = ''; return finish(); }
      R.msg = 'Sent. Every call gets a listen.';
      R.i = next;
      render(true);
    });
}
function sentence(s) { s = String(s || '').trim(); s = s.charAt(0).toUpperCase() + s.slice(1); return /[.!?]$/.test(s) ? s : s + '.'; }
function go(d) { stopRec(false); stopPlay(); dropTake(); R.msg = ''; R.i = Math.max(0, Math.min(LINES.length - 1, R.i + d)); render(); }
/* Skip moves on and sends nothing; on the last line it is Finish, the end screen */
function skip() { var k = afterSkip(R.i); if (k < 0) finish(); else go(k - R.i); }
function finish() {
  stopRec(false); stopPlay(); dropTake();
  R.done = true; R.msg = '';
  render();
  var h = $('vo-done-h'); if (h) try { h.focus({ preventScroll: true }); } catch (e) {}
}
/* the end screen's two ways out: home (ui.js sets onHome: from the mound it waits for a play, as the
   home button does) or back to line 1 to redo one */
function again() { R.done = false; R.i = 0; R.msg = ''; render(); var b = $('vo-rec'); if (b) try { b.focus({ preventScroll: true }); } catch (e) {} }
function home() { close(); if (api.onHome) api.onHome(); }
var CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function renderDone(body) {
  var dots = '';
  for (var k = 0; k < LINES.length; k++) dots += '<i class="' + (R.sent[LINES[k].id] ? 'sent' : '') + '"></i>';
  var n = R.n;
  body.innerHTML =
    '<div class="vo-done" id="vo-done">' +
      '<span class="vo-badge vo-ok-badge">' + CHECK_SVG + '</span>' +
      '<h3 class="vo-done-h" id="vo-done-h" tabindex="-1">All done!</h3>' +
      '<div class="vo-dots" aria-hidden="true">' + dots + '</div>' +
      '<p class="vo-done-n" id="vo-done-n">' + (n ? 'You sent ' + n + (n === 1 ? ' call' : ' calls') + ' this session.' : 'No calls sent this session.') + '</p>' +
      (R.pending ? '<p class="quiet vo-done-p" id="vo-pending">' + (R.pending === 1 ? '1 call waits' : R.pending + ' calls wait') + ' for review.</p>' : '') +
      '<p class="quiet vo-done-p">Every call gets a listen.</p>' +
      '<button class="btn vo-send vo-home" type="button" id="vo-home">Back to home</button>' +
      '<button class="btn ghost vo-again" type="button" id="vo-again">Record a line again</button>' +
    '</div>';
  $('vo-home').addEventListener('click', home);
  $('vo-again').addEventListener('click', again);
}

/* playback: the take's own shape lights up as it plays. The length is the take's (a webm from
   Chrome reports an endless duration) */
function stopPlay() { var a = $('vo-audio'); if (a) { try { a.pause(); a.currentTime = 0; } catch (e) {} } playUI(false); }
function playUI(on) {
  var b = $('vo-play'); if (!b) return;
  b.classList.toggle('on', on); b.setAttribute('aria-label', on ? 'Stop' : 'Play it back');
  if (!on) { var w = $('vo-bars'); if (w && R.take) drawBars(w, R.take.lv, BARS); }
}
function togglePlay() {
  var a = $('vo-audio'), t = R.take;
  if (!a || !t) return;
  if (!a.paused) return stopPlay();
  try { a.currentTime = 0; } catch (e) {}
  var p = a.play(); if (p && p.catch) p.catch(function () { playUI(false); });
  playUI(true);
  (function step() {
    if (a.paused || a.ended || !$('vo-audio')) return playUI(false);
    drawBars($('vo-bars'), t.lv, Math.ceil(Math.min(1, a.currentTime * 1000 / Math.max(1, t.ms)) * BARS));
    requestAnimationFrame(step);
  })();
}

var MIC_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="3" width="7" height="11" rx="3.5"/><path d="M11 7.4h2M11 10.4h2M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"/></svg>';
function render(keepMsg) {
  var body = $('vo-body');
  if (!body) return;
  if (!signedIn()) {
    body.innerHTML = '<div class="vo-out"><span class="vo-badge">' + MIC_SVG + '</span>' +
      '<p class="vo-out-h">Record your voice. Be the ump!</p>' +
      '<p class="quiet">Sign in to send one. Every call gets a listen. The best ones make the game.</p>' +
      '<button class="btn go vo-signin" type="button" id="vo-signin">Sign in</button></div>';
    $('vo-signin').addEventListener('click', function () { close(); if (MN()) MN().show('auth'); });
    return;
  }
  if (R.done) return renderDone(body);
  var line = LINES[R.i], t = R.take, recOn = !!R.rec, st = recOn ? 'rec' : t ? 'take' : 'idle', last = R.i === LINES.length - 1;
  var dots = '';
  for (var k = 0; k < LINES.length; k++) dots += '<i class="' + (k === R.i ? 'now' : '') + (R.sent[LINES[k].id] ? ' sent' : '') + '"></i>';
  var bars = '';
  for (var j = 0; j < BARS; j++) bars += '<i></i>';
  var h =
    '<div class="vo-top">' +
      '<button class="vo-nav" type="button" id="vo-prev"' + (R.i === 0 ? ' disabled' : '') + '><i class="vo-chev back" aria-hidden="true"></i>Back</button>' +
      '<p class="vo-n" id="vo-n">Line ' + (R.i + 1) + ' of ' + LINES.length + (R.sent[line.id] ? ' · sent' : '') + '</p>' +
      (last
        ? '<button class="vo-nav vo-fin" type="button" id="vo-finish">Finish<i class="vo-chev" aria-hidden="true"></i></button>'
        : '<button class="vo-nav" type="button" id="vo-next">Skip<i class="vo-chev" aria-hidden="true"></i></button>') +
    '</div>' +
    '<div class="vo-dots" aria-hidden="true">' + dots + '</div>' +
    '<div class="vo-card"><p class="vo-line" id="vo-line">' + esc(line.text) + '</p>' +
      (line.hint ? '<p class="vo-hint">' + esc(line.hint) + '</p>' : '') + '</div>' +
    '<div class="vo-stage" id="vo-stage" data-st="' + st + '">' +
      '<div class="vo-bars" id="vo-bars" aria-hidden="true">' + bars + '</div>';
  if (st !== 'take') {
    h +=
      '<button class="vo-recb' + (recOn ? ' on' : '') + '" type="button" id="vo-rec" aria-pressed="' + recOn + '" aria-label="' + (recOn ? 'Stop recording' : 'Record') + '">' +
        '<svg class="vo-ringsv" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" pathLength="100"/><circle id="vo-ring" cx="50" cy="50" r="47" pathLength="100"/></svg>' +
        '<span class="vo-core"></span></button>' +
      '<p class="vo-cap" id="vo-cap">' + (recOn ? '<b id="vo-left">' + (MAX_MS / 1000).toFixed(1) + '</b> s left. Tap to stop.' : 'Tap to record. Up to ' + MAX_MS / 1000 + ' seconds.') + '</p>' +
      '<p class="au-err vo-msg" id="vo-msg" role="status">' + esc(R.msg) + '</p>' +
      (R.mic && !recOn
        ? '<label class="btn ghost vo-upbtn" for="vo-file">Upload a file</label>'
        : '<label class="vo-link" for="vo-file"' + (recOn ? ' hidden' : '') + '>or upload a file</label>') +
      '<input type="file" id="vo-file" accept="audio/*" hidden>';
  } else {
    h +=
      '<div class="vo-take">' +
        '<button class="vo-playb" type="button" id="vo-play" aria-label="Play it back"><span class="vo-tri" aria-hidden="true"></span></button>' +
        '<span class="vo-dur" id="vo-dur">' + (t.ms / 1000).toFixed(1) + ' s' + (t.upload ? ' · file' : '') + '</span>' +
        '<button class="vo-link vo-redo" type="button" id="vo-redo">Record again</button>' +
      '</div>' +
      '<audio id="vo-audio" preload="auto" src="' + esc(t.url) + '"></audio>' +
      (R.consent
        ? '<details class="vo-okd"><summary><i class="vo-tick" aria-hidden="true"></i>Consent given for this session.</summary>' +
            '<label class="vo-ok"><input type="checkbox" id="vo-consent" checked><span>' + esc(CONSENT) + '</span></label></details>'
        : '<label class="vo-ok"><input type="checkbox" id="vo-consent"><span>' + esc(CONSENT) + '</span></label>') +
      '<label class="vo-credit"><span>Credit me as (optional)</span><input type="text" id="vo-cr" maxlength="' + CREDIT_MAX + '" autocomplete="nickname" placeholder="Your name or handle" value="' + esc(R.credit) + '"></label>' +
      '<button class="btn vo-send" type="button" id="vo-send"' + (R.consent && !R.busy ? '' : ' disabled') + '>' + (R.busy ? 'Sending' : 'Send this call') + '</button>' +
      '<p class="au-err vo-msg" id="vo-msg" role="status">' + esc(R.msg) + '</p>';
  }
  h += '</div>' +
    (R.pending ? '<p class="quiet vo-pend" id="vo-pending">' + (R.pending === 1 ? '1 call waits' : R.pending + ' calls wait') + ' for review.</p>' : '');
  body.innerHTML = h;
  if (/^Sent/.test(R.msg)) $('vo-msg').classList.add('ok');
  drawBars($('vo-bars'), t ? t.lv : [], t ? BARS : null);
  $('vo-prev').addEventListener('click', function () { go(-1); });
  $(last ? 'vo-finish' : 'vo-next').addEventListener('click', skip);
  if (st !== 'take') {
    $('vo-rec').addEventListener('click', function () { if (R.rec) stopRec(true); else startRec(); });
    $('vo-file').addEventListener('change', function (e) { stopRec(false); fromFile(e.target.files && e.target.files[0]); e.target.value = ''; });
  } else {
    var au = $('vo-audio');
    au.addEventListener('ended', function () { playUI(false); });
    $('vo-play').addEventListener('click', togglePlay);
    $('vo-redo').addEventListener('click', function () { stopPlay(); dropTake(); R.msg = ''; startRec(); });
    $('vo-consent').addEventListener('change', function (e) { setConsent(e.target.checked); var s = $('vo-send'); if (s) s.disabled = !(R.take && R.consent && !R.busy); });
    $('vo-cr').addEventListener('input', function (e) { R.credit = e.target.value; });
    $('vo-send').addEventListener('click', send);
  }
  if (!keepMsg && R.msg && /^Sent/.test(R.msg)) R.msg = '';
}
/* source: home, result or settings, for voice_open (events.js) */
function open(source) {
  R.msg = ''; R.busy = false; R.pending = null; R.mic = '';
  /* finished last time: open on line 1 again */
  if (R.done) { R.done = false; R.i = 0; }
  if (typeof source !== 'string') source = 'settings';
  render();
  if (MN()) MN().open('sheet-voices', function () { stopRec(false); stopPlay(); dropTake(); });
  if (EVS() && EVS().voiceOpen) EVS().voiceOpen(source);
  if (signedIn() && A().umpMine) A().umpMine().then(function (rows) { if (Array.isArray(rows)) { R.pending = rows.length; render(true); } });
}
function close() { if (MN() && MN().current() === 'sheet-voices') MN().close(); }

/* ---- the testers' review sheet -------------------------------------------- */
/* Two steps to the game (the owner, 2026-11-17; supabase/177). A tester's Approve is a shortlist.
   The owner hears each shortlisted call in the game's own ump mix (sound.js umpPreview, the same
   chain the game plays a clip through) and puts it in the game or rejects it. Only the owner's tap
   makes a call live. The owner can also put a waiting call straight in, and take a live one out
   (back to the shortlist, file kept) or reject it. A tester never changes a live call. The server
   checks all of it again; the buttons only follow it. */

/* role: 'owner' or 'tester' (settingsRows asks). confirm: the id of the row whose Reject is asking
   "Delete it for good?" (one at a time). heard: {id: what "Hear it in the game" said} */
/* person, line: the filters ('all' or a key), kept across the tabs. live: the Live list's rows, for
   how many lines a person has live (null until read) */
var Q = { tab: 'pending', role: null, rows: null, urls: {}, msg: '', ok: '', confirm: null, heard: {}, person: 'all', line: 'all', live: null };
var TABS = [['pending', 'Waiting'], ['shortlisted', 'Shortlisted'], ['approved', 'Live'], ['rejected', 'Rejected']];
var HEARD = { played: 'Played in the game\'s ump mix.', off: 'The sound is off. Turn it on in settings.', failed: 'That clip didn\'t play. Try again.' };
/* what each tab offers, by role: [action, label, class]. 'hear' plays it through the game's chain */
function actions(status, role) {
  var own = role === 'owner';
  if (status === 'pending') return own ? [['approved', 'Put in the game', 'go'], ['rejected', 'Reject', 'ghost']] : [['shortlisted', 'Shortlist', 'go'], ['rejected', 'Reject', 'ghost']];
  if (status === 'shortlisted') return own ? [['approved', 'Put in the game', 'go'], ['rejected', 'Reject', 'ghost']] : [['rejected', 'Reject', 'ghost']];
  if (status === 'approved') return own ? [['shortlisted', 'Take it out', 'ghost'], ['rejected', 'Reject', 'ghost']] : [];
  return [];
}
var DONE = { shortlisted: 'Shortlisted. The owner puts it in the game.', approved: 'In the game.', rejected: 'Rejected. The audio goes for good.' };
/* a tester's Waiting tab says what Shortlist does; the owner's tabs say what's theirs */
var LEAD = {
  tester: { pending: 'Shortlist the good ones. The owner puts them in the game.', shortlisted: 'Waiting for the owner.', approved: 'In the game now. Only the owner changes these.' },
  owner: { pending: 'Put a good one straight in the game.', shortlisted: 'Testers liked these. Hear each one in the game first.', approved: 'In the game now. Take one out to hold it on the shortlist.' },
};
function loadQueue() {
  Q.rows = null; Q.msg = ''; Q.confirm = null; Q.heard = {}; renderQueue();
  var a = A();
  if (!a.umpQueue) { Q.rows = []; Q.msg = 'Reviews are not available here.'; return renderQueue(); }
  var tab = Q.tab;
  a.umpQueue(tab).then(function (r) {
    if (tab !== Q.tab) return;
    if (!r || r.error) { Q.rows = []; Q.msg = r && r.error ? sentence(r.error) : 'Could not load the calls.'; return renderQueue(); }
    Q.rows = Array.isArray(r.data) ? r.data : [];
    var paths = Q.rows.map(function (x) { return x.path; }).filter(Boolean);
    if (!paths.length || !a.umpUrls) return renderQueue();
    renderQueue();
    a.umpUrls(paths, 3600).then(function (m) { if (tab === Q.tab) { Q.urls = m || {}; renderQueue(); } });
  });
}
function when(s) { try { var d = new Date(s); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
/* who decided (177): who shortlisted it, who put it in the game; on a rejected call, who rejected it */
function deciders(x) {
  var out = [];
  if (x.shortlistedBy) out.push('Shortlisted by @' + x.shortlistedBy);
  if (x.status === 'approved' && x.liveBy) out.push('Put in the game by @' + x.liveBy);
  /* a call put live before 177 has no liveBy on an old server: its reviewer put it live */
  else if (x.status === 'approved' && x.reviewedBy && !('liveBy' in x)) out.push('Put in the game by @' + x.reviewedBy);
  if (x.status === 'rejected' && x.reviewedBy) out.push('Rejected by @' + x.reviewedBy);
  return out;
}
function renderQueue() {
  var body = $('vr-body');
  if (!body) return;
  var role = Q.role === 'owner' ? 'owner' : 'tester';
  var h = '<div class="seg vr-tabs" role="tablist">' + TABS.map(function (t) {
    return '<button type="button" role="tab" data-vr-tab="' + t[0] + '" aria-selected="' + (Q.tab === t[0]) + '">' + t[1] + '</button>';
  }).join('') + '</div>';
  var lead = LEAD[role][Q.tab];
  if (lead) h += '<p class="quiet vr-lead" id="vr-lead">' + esc(lead) + '</p>';
  h += filtersHtml();
  if (Q.ok) h += '<p class="au-err ok vr-ok" role="status">' + esc(Q.ok) + '</p>';
  var shown = Q.rows ? filterRows(Q.rows, Q.person, Q.line) : null;
  if (Q.rows == null) h += '<p class="quiet">Loading.</p>';
  else if (!Q.rows.length) h += '<p class="quiet" id="vr-empty">' + esc(Q.msg || 'Nothing here.') + '</p>';
  else if (!shown.length) h += '<p class="quiet" id="vr-empty">Nothing here for this filter.</p>';
  else {
    h += '<ul class="vr-list" id="vr-list">' + shown.map(function (x) {
      var ln = lineOf(x.line), who = [x.credit ? 'Credit: ' + x.credit : '', x.username ? '@' + x.username : ''].filter(Boolean).join(' · ');
      var url = Q.urls[x.path];
      var by = deciders(x), acts = x.path ? actions(x.status, role) : [];
      var asking = Q.confirm === x.id && x.status !== 'rejected';
      return '<li class="vr-row" data-id="' + esc(x.id) + '"><div class="vr-h"><b>' + esc(ln ? ln.text : x.line) + '</b><small>' +
        esc([who, when(x.createdAt), x.ms ? (x.ms / 1000).toFixed(1) + ' s' : ''].filter(Boolean).join(' · ')) + '</small>' +
        by.map(function (b) { return '<small class="vr-by">' + esc(b) + '</small>'; }).join('') + '</div>' +
        /* a rejected call has no file (175 deletes it), so it can only stay rejected */
        (!x.path ? '<p class="quiet">Audio deleted.</p>' : url ? '<audio controls preload="none" src="' + esc(url) + '"></audio>' : '<p class="quiet">Loading the clip.</p>') +
        /* the game's own mix, through sound.js: on every row with a file the reviewer can still act on */
        (x.path && url && x.status !== 'rejected' ? '<button class="btn ghost vr-hear" type="button" data-vr-hear>Hear it in the game</button>' +
          (Q.heard[x.id] ? '<p class="quiet vr-heard" role="status">' + esc(HEARD[Q.heard[x.id]] || HEARD.failed) + '</p>' : '') : '') +
        (asking ?
          /* a reject deletes the audio within the hour (175) and cannot be undone: ask first */
          '<div class="vr-ask" role="group" aria-label="Confirm reject"><p>Delete it for good?</p><div class="vr-act">' +
            '<button class="btn bad" type="button" data-vr-yes>Yes</button>' +
            '<button class="btn ghost" type="button" data-vr-no>Cancel</button>' +
          '</div></div>' :
          acts.length ? '<div class="vr-act">' + acts.map(function (b) {
            return '<button class="btn ' + b[2] + '" type="button" data-vr="' + b[0] + '">' + b[1] + '</button>';
          }).join('') + '</div>' : '') +
        '</li>';
    }).join('') + '</ul>';
    if (Q.msg) h += '<p class="au-err" role="status">' + esc(Q.msg) + '</p>';
  }
  body.innerHTML = h;
}
/* Person and Call over the list, and with a person picked, their set: N of 12 lines live, a dot a line */
function filtersHtml() {
  var ps = people(Q.rows || []), total = (Q.rows || []).length;
  if (Q.person !== 'all' && !ps.some(function (p) { return p.key === Q.person; })) ps.push({ key: Q.person, label: personLabel(Q.person), n: 0 });
  var opt = function (v, label, on) { return '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(label) + '</option>'; };
  var h = '<div class="vr-filters">' +
    '<label class="vr-f"><span>Person</span><select id="vr-person" data-vr-f="person"' + (Q.rows ? '' : ' disabled') + '>' +
      opt('all', 'All (' + total + ')', Q.person === 'all') +
      ps.map(function (p) { return opt(p.key, p.label + ' (' + p.n + ')', Q.person === p.key); }).join('') + '</select></label>' +
    '<label class="vr-f"><span>Call</span><select id="vr-line" data-vr-f="line"' + (Q.rows ? '' : ' disabled') + '>' +
      opt('all', 'All', Q.line === 'all') +
      LINES.map(function (l) { return opt(l.id, l.text, Q.line === l.id); }).join('') + '</select></label>' +
  '</div>';
  if (Q.person !== 'all') {
    var live = Q.live ? liveLinesOf(Q.live, Q.person) : null, n = live ? Object.keys(live).length : null;
    var dots = '';
    for (var k = 0; k < LINES.length; k++) dots += '<i class="' + (live && live[LINES[k].id] ? 'sent' : '') + '"></i>';
    h += '<div class="vr-set" id="vr-set"><div class="vr-set-h"><b>' + esc(personLabel(Q.person)) + '</b>' +
      '<span id="vr-set-n">' + (n == null ? 'Checking the live set.' : n + ' of ' + LINES.length + ' lines live') + '</span></div>' +
      '<div class="vo-dots" aria-hidden="true">' + dots + '</div>' +
      '<p class="quiet">' + (n === LINES.length ? 'A full set. A game can use this voice for every call.' : 'In script order.') + '</p></div>';
  }
  return h;
}
function loadLive() {
  var a = A();
  if (!a.umpQueue) return;
  a.umpQueue('approved').then(function (r) { Q.live = r && Array.isArray(r.data) ? r.data : []; renderQueue(); });
}
function hear(id, b) {
  var x = (Q.rows || []).filter(function (r) { return r.id === id; })[0], S = window.STD_SFX;
  var url = x && Q.urls[x.path];
  if (!url || !S || !S.umpPreview) { Q.heard[id] = 'failed'; return renderQueue(); }
  b.disabled = true;
  S.umpPreview(url).catch(function () { return 'failed'; }).then(function (r) {
    Q.heard[id] = r; renderQueue(); focusIn(id, '[data-vr-hear]');
  });
}
function wireQueue() {
  var body = $('vr-body');
  if (!body || body.dataset.wired) return;
  body.dataset.wired = '1';
  body.addEventListener('change', function (e) {
    var f = e.target.closest && e.target.closest('[data-vr-f]');
    if (!f) return;
    Q[f.getAttribute('data-vr-f')] = f.value;
    Q.confirm = null;
    renderQueue();
    var again = $(f.id); if (again) try { again.focus({ preventScroll: true }); } catch (x) {}
  });
  body.addEventListener('click', function (e) {
    var tb = e.target.closest('[data-vr-tab]');
    if (tb) { Q.tab = tb.getAttribute('data-vr-tab'); Q.ok = ''; return loadQueue(); }
    var row = e.target.closest('.vr-row');
    if (!row) return;
    var id = row.getAttribute('data-id');
    var hb = e.target.closest('[data-vr-hear]');
    if (hb) { if (!hb.disabled) hear(id, hb); return; }
    /* Reject first asks; Cancel puts the row back; Yes is the reject */
    if (e.target.closest('[data-vr-no]')) { Q.confirm = null; renderQueue(); return focusIn(id, '[data-vr="rejected"]'); }
    var yes = e.target.closest('[data-vr-yes]');
    var b = yes || e.target.closest('[data-vr]');
    if (!b || b.disabled) return;
    var st = yes ? 'rejected' : b.getAttribute('data-vr');
    if (st === 'rejected' && !yes) { Q.confirm = id; Q.msg = ''; renderQueue(); return focusIn(id, '[data-vr-no]'); }
    b.disabled = true;
    A().umpReview(id, st).then(function (r) {
      if (!r || r.error) { b.disabled = false; Q.msg = r && r.error ? sentence(r.error) : 'That did not save.'; return renderQueue(); }
      var now = r.data && r.data.status || st;
      Q.rows = Q.rows.filter(function (x) { return x.id !== id; });
      Q.msg = ''; Q.confirm = null;
      Q.ok = now === 'shortlisted' && Q.tab === 'approved' ? 'Taken out. It waits on the shortlist.' : DONE[now] || '';
      renderQueue();
      countRow();
      /* a call in or out of the game moves the live count */
      if (now === 'approved' || st === 'approved' || Q.tab === 'approved') loadLive();
    });
  });
}
function focusIn(id, sel) {
  var body = $('vr-body'), li = body && body.querySelector('.vr-row[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  var el = li && li.querySelector(sel);
  if (el) el.focus();
}
function openReview() {
  wireQueue();
  /* the owner opens on the shortlist when calls wait there */
  Q.tab = Q.role === 'owner' && Q.count > 0 ? 'shortlisted' : 'pending';
  Q.ok = ''; Q.person = 'all'; Q.line = 'all'; Q.live = null;
  if (MN()) MN().open('sheet-ump-review');
  loadQueue();
  loadLive();
}

/* the settings row's sub-line: for the owner, a quiet count of the shortlist ("3 shortlisted for you.") */
function countLine(role, n) {
  if (role === 'owner' && n > 0) return n + ' shortlisted for you.';
  return 'Testers only.';
}
function countRow() {
  var a = A(), b = $('set-ump-review');
  if (!b || Q.role !== 'owner' || !a.umpCounts) return;
  a.umpCounts().then(function (c) {
    Q.count = c && c.shortlisted > 0 ? Number(c.shortlisted) : 0;
    var s = b.querySelector('small'); if (s) s.textContent = countLine(Q.role, Q.count);
  });
}

/* the settings sheet's buttons: record for everyone, review for testers (the owner too) once the server says so */
function settingsRows(box) {
  if (!box) return;
  var h = '<button type="button" class="set-row set-go" id="set-voices"><span><b>Voice of the ump</b><small>Record a call. The best ones go in the game.</small></span><i class="chev" aria-hidden="true"></i></button>' +
    '<button type="button" class="set-row set-go" id="set-ump-review" hidden><span><b>Review ump calls</b><small>Testers only.</small></span><i class="chev" aria-hidden="true"></i></button>';
  box.insertAdjacentHTML('beforeend', h);
  $('set-voices').addEventListener('click', function () { open('settings'); });
  $('set-ump-review').addEventListener('click', openReview);
  var a = A(), ask = !signedIn() ? null : a.umpRole ? a.umpRole() : a.umpOwner ? a.umpOwner().then(function (y) { return y === true ? 'owner' : null; }) : null;
  if (ask) ask.then(function (role) {
    var b = $('set-ump-review');
    if (!b || (role !== 'owner' && role !== 'tester')) return;
    Q.role = role;
    b.hidden = false;
    countRow();
  });
}

/* ---- the game's clips ------------------------------------------------------ */
/* At each outing's start (ui.js, the mound up, with the outing's id): the live list once a page, a beat
   after the first mound, and only with the sound on. Then one voice for this outing (pickVoice, seeded
   by its id, so a resumed outing and a reload keep it), sound.js told to play only that voice, and a
   few of that voice's clips a line signed and handed over. Another voice's clips are never fetched for
   it. A Survivor spot, an archive day, a challenge and practice are each their own outing, so each
   may get a different voice. */
/* urls: signed for 6 hours, kept for 5 (urlsAt) */
var pre = { list: null, busy: false, key: null, voice: null, urls: {}, urlsAt: 0 };
function preload(key) {
  var S = window.STD_SFX, a = A();
  if (!S || !S.umpClips) return;
  key = key == null ? 'page' : String(key);
  /* a new outing: no voice until it is picked, so the last outing's never answers this one's call */
  if (key !== pre.key) { pre.key = key; pre.voice = null; if (S.umpUse) S.umpUse(null); }
  if (!S.isOn() || !a.umpApproved || !a.umpUrls) return;
  if (pre.list) return useVoice(key);
  if (pre.busy) return;
  pre.busy = true;
  setTimeout(function () {
    a.umpApproved().then(function (list) {
      pre.busy = false;
      if (!Array.isArray(list)) return;
      pre.list = list;
      useVoice(pre.key);
    }).catch(function () { pre.busy = false; });
  }, 1200);
}
function useVoice(key) {
  var S = window.STD_SFX, a = A();
  if (key !== pre.key || pre.voice) return;
  var v = pickVoice(pre.list, key);
  if (!v) return;
  pre.voice = v;
  if (S.umpUse) S.umpUse(v);
  if (Date.now() - pre.urlsAt > 5 * 3600 * 1000) { pre.urls = {}; pre.urlsAt = Date.now(); }
  var pick = plan(pre.list, PER_LINE, seeded(key + '/clips'), v);
  var need = pick.filter(function (c) { return !pre.urls[c.path]; }).map(function (c) { return c.path; });
  var hand = function () {
    if (key !== pre.key) return;
    S.umpClips(pick.filter(function (c) { return pre.urls[c.path]; }).map(function (c) { return { line: c.line, url: pre.urls[c.path], voice: v }; }));
  };
  if (!need.length) return hand();
  a.umpUrls(need, 6 * 3600).then(function (m) {
    if (m) for (var p in m) pre.urls[p] = m[p];
    hand();
  });
}

api.open = open;
api.openReview = openReview;
api.settingsRows = settingsRows;
api.actions = actions;
api.preload = preload;
window.STD_VOICES = api;
})();
