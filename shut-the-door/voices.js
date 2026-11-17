/* voices.js: the voice of the ump. window.STD_VOICES.
 *
 * Players record (or upload) an umpire's call from a script, the owner listens and approves or
 * rejects it, and the game plays a random approved clip for that call (sound.js ump()). The server
 * is supabase/165_shut_the_door_ump_voices.sql; auth.js makes the calls.
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
 *   again. A reject deletes the audio for good (175), so it asks first, inside the sheet.
 * - The game preloads a few approved clips once the mound is up, after a beat, and only while the
 *   sound is on. A call never waits for a clip: a line with none stays silent.
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
/* which approved clips to fetch: up to PER_LINE a line, chosen at random */
function plan(list, perLine, rand) {
  rand = rand || Math.random; perLine = perLine || PER_LINE;
  var by = {}, out = [];
  (list || []).forEach(function (c) { if (c && c.path && lineOf(c.line)) (by[c.line] = by[c.line] || []).push(c); });
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

var api = {
  API_VERSION: 1,
  LINES: LINES, CONSENT: CONSENT, CONSENT_V: CONSENT_V, MAX_MS: MAX_MS, MAX_BYTES: MAX_BYTES, MIMES: MIMES,
  CREDIT_MAX: CREDIT_MAX, PENDING_MAX: PENDING_MAX, CALLS: CALLS,
  lineOf: lineOf, baseMime: baseMime, check: check, recorderMime: recorderMime, cleanCredit: cleanCredit,
  linesFor: linesFor, plan: plan, micError: micError, MIC_SAY: MIC_SAY, peaks: peaks, nextOpen: nextOpen,
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

var R = { i: 0, take: null, rec: null, consent: false, credit: '', busy: false, msg: '', mic: '', sent: {}, pending: null, src: '' };
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
      if (R.pending != null) R.pending++;
      if (EVS() && EVS().voiceSent) EVS().voiceSent(line.id, t.upload ? 'upload' : 'record');
      dropTake();
      var next = nextOpen(R.sent, R.i);
      R.msg = next < 0 ? 'Sent. That\'s every line. The owner hears them all.' : 'Sent. The owner hears every call.';
      if (next >= 0) R.i = next;
      render(true);
    });
}
function sentence(s) { s = String(s || '').trim(); s = s.charAt(0).toUpperCase() + s.slice(1); return /[.!?]$/.test(s) ? s : s + '.'; }
function go(d) { stopRec(false); stopPlay(); dropTake(); R.msg = ''; R.i = Math.max(0, Math.min(LINES.length - 1, R.i + d)); render(); }

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
      '<p class="quiet">Sign in to send one. The owner hears every call. The best ones make the game.</p>' +
      '<button class="btn go vo-signin" type="button" id="vo-signin">Sign in</button></div>';
    $('vo-signin').addEventListener('click', function () { close(); if (MN()) MN().show('auth'); });
    return;
  }
  var line = LINES[R.i], t = R.take, recOn = !!R.rec, st = recOn ? 'rec' : t ? 'take' : 'idle';
  var dots = '';
  for (var k = 0; k < LINES.length; k++) dots += '<i class="' + (k === R.i ? 'now' : '') + (R.sent[LINES[k].id] ? ' sent' : '') + '"></i>';
  var bars = '';
  for (var j = 0; j < BARS; j++) bars += '<i></i>';
  var h =
    '<div class="vo-top">' +
      '<button class="vo-nav" type="button" id="vo-prev"' + (R.i === 0 ? ' disabled' : '') + '><i class="vo-chev back" aria-hidden="true"></i>Back</button>' +
      '<p class="vo-n" id="vo-n">Line ' + (R.i + 1) + ' of ' + LINES.length + (R.sent[line.id] ? ' · sent' : '') + '</p>' +
      '<button class="vo-nav" type="button" id="vo-next"' + (R.i === LINES.length - 1 ? ' disabled' : '') + '>Skip<i class="vo-chev" aria-hidden="true"></i></button>' +
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
  $('vo-next').addEventListener('click', function () { go(1); });
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
  if (typeof source !== 'string') source = 'settings';
  render();
  if (MN()) MN().open('sheet-voices', function () { stopRec(false); stopPlay(); dropTake(); });
  if (EVS() && EVS().voiceOpen) EVS().voiceOpen(source);
  if (signedIn() && A().umpMine) A().umpMine().then(function (rows) { if (Array.isArray(rows)) { R.pending = rows.length; render(true); } });
}
function close() { if (MN() && MN().current() === 'sheet-voices') MN().close(); }

/* ---- the testers' review sheet -------------------------------------------- */

/* confirm: the id of the row whose Reject is asking "Delete it for good?" (one at a time) */
var Q = { tab: 'pending', rows: null, urls: {}, msg: '', confirm: null };
function loadQueue() {
  Q.rows = null; Q.msg = ''; Q.confirm = null; renderQueue();
  var a = A();
  if (!a.umpQueue) { Q.rows = []; Q.msg = 'Reviews are not available here.'; return renderQueue(); }
  a.umpQueue(Q.tab).then(function (r) {
    if (!r || r.error) { Q.rows = []; Q.msg = r && r.error ? sentence(r.error) : 'Could not load the calls.'; return renderQueue(); }
    Q.rows = Array.isArray(r.data) ? r.data : [];
    var paths = Q.rows.map(function (x) { return x.path; }).filter(Boolean);
    if (!paths.length || !a.umpUrls) return renderQueue();
    renderQueue();
    a.umpUrls(paths, 3600).then(function (m) { Q.urls = m || {}; renderQueue(); });
  });
}
function when(s) { try { var d = new Date(s); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
function renderQueue() {
  var body = $('vr-body');
  if (!body) return;
  var tabs = [['pending', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Rejected']];
  var h = '<div class="seg" role="tablist">' + tabs.map(function (t) {
    return '<button type="button" role="tab" data-vr-tab="' + t[0] + '" aria-selected="' + (Q.tab === t[0]) + '">' + t[1] + '</button>';
  }).join('') + '</div>';
  if (Q.rows == null) h += '<p class="quiet">Loading.</p>';
  else if (!Q.rows.length) h += '<p class="quiet" id="vr-empty">' + esc(Q.msg || 'Nothing here.') + '</p>';
  else {
    h += '<ul class="vr-list">' + Q.rows.map(function (x) {
      var ln = lineOf(x.line), who = [x.credit ? 'Credit: ' + x.credit : '', x.username ? '@' + x.username : ''].filter(Boolean).join(' · ');
      var url = Q.urls[x.path];
      /* who decided (176's reviewedBy), on the Approved and Rejected tabs */
      var by = x.status !== 'pending' && x.reviewedBy ? (x.status === 'approved' ? 'Approved' : 'Rejected') + ' by @' + x.reviewedBy : '';
      var asking = Q.confirm === x.id && x.status !== 'rejected';
      return '<li class="vr-row" data-id="' + esc(x.id) + '"><div class="vr-h"><b>' + esc(ln ? ln.text : x.line) + '</b><small>' +
        esc([who, when(x.createdAt), x.ms ? (x.ms / 1000).toFixed(1) + ' s' : ''].filter(Boolean).join(' · ')) + '</small>' +
        (by ? '<small class="vr-by">' + esc(by) + '</small>' : '') + '</div>' +
        /* a rejected call has no file (175 deletes it), so it can only stay rejected */
        (!x.path ? '<p class="quiet">Audio deleted.</p>' : url ? '<audio controls preload="none" src="' + esc(url) + '"></audio>' : '<p class="quiet">Loading the clip.</p>') +
        (asking ?
          /* a reject deletes the audio within the hour (175) and cannot be undone: ask first */
          '<div class="vr-ask" role="group" aria-label="Confirm reject"><p>Delete it for good?</p><div class="vr-act">' +
            '<button class="btn bad" type="button" data-vr-yes>Yes</button>' +
            '<button class="btn ghost" type="button" data-vr-no>Cancel</button>' +
          '</div></div>' :
          '<div class="vr-act">' +
            (x.status !== 'approved' && x.path ? '<button class="btn go" type="button" data-vr="approved">Approve</button>' : '') +
            (x.status !== 'rejected' ? '<button class="btn ghost" type="button" data-vr="rejected">Reject</button>' : '') +
          '</div>') +
        '</li>';
    }).join('') + '</ul>';
    if (Q.msg) h += '<p class="au-err" role="status">' + esc(Q.msg) + '</p>';
  }
  body.innerHTML = h;
}
function wireQueue() {
  var body = $('vr-body');
  if (!body || body.dataset.wired) return;
  body.dataset.wired = '1';
  body.addEventListener('click', function (e) {
    var tb = e.target.closest('[data-vr-tab]');
    if (tb) { Q.tab = tb.getAttribute('data-vr-tab'); return loadQueue(); }
    var row = e.target.closest('.vr-row');
    if (!row) return;
    var id = row.getAttribute('data-id');
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
      Q.rows = Q.rows.filter(function (x) { return x.id !== id; });
      Q.msg = ''; Q.confirm = null;
      renderQueue();
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
  Q.tab = 'pending';
  if (MN()) MN().open('sheet-ump-review');
  loadQueue();
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
  if (ask) ask.then(function (role) { var b = $('set-ump-review'); if (b && (role === 'owner' || role === 'tester')) b.hidden = false; });
}

/* ---- the game's clips ------------------------------------------------------ */
/* once a page, a beat after the mound is up, and only with the sound on: the approved list, a few a
   line, signed URLs for those, handed to sound.js, which fetches and decodes them off the pitch */
var pre = { done: false, busy: false };
function preload() {
  if (pre.done || pre.busy) return;
  var S = window.STD_SFX, a = A();
  if (!S || !S.umpClips || !S.isOn() || !a.umpApproved || !a.umpUrls) return;
  pre.busy = true;
  setTimeout(function () {
    a.umpApproved().then(function (list) {
      if (!Array.isArray(list)) { pre.busy = false; return; }
      pre.done = true;
      var pick = plan(list);
      if (!pick.length) return;
      return a.umpUrls(pick.map(function (c) { return c.path; }), 6 * 3600).then(function (m) {
        pre.busy = false;
        if (!m) { pre.done = false; return; }
        S.umpClips(pick.filter(function (c) { return m[c.path]; }).map(function (c) { return { line: c.line, url: m[c.path] }; }));
      });
    }).catch(function () { pre.busy = false; });
  }, 1200);
}

api.open = open;
api.openReview = openReview;
api.settingsRows = settingsRows;
api.preload = preload;
window.STD_VOICES = api;
})();
