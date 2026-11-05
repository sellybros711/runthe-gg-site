/* voices.js: the voice of the ump. window.STD_VOICES.
 *
 * Players record (or upload) an umpire's call from a script, the owner listens and approves or
 * rejects it, and the game plays a random approved clip for that call (sound.js ump()). The server
 * is supabase/165_shut_the_door_ump_voices.sql; auth.js makes the calls.
 *
 * The rules it keeps:
 * - Both sheets open from a button in settings. Nothing here opens by itself.
 * - Signed in only. Signed out the sheet shows the sign-in button, as the rest of the game does.
 * - The mic is asked for only on the record tap (getUserMedia), with the browser's own codec.
 *   A take stops itself at MAX_MS. An upload longer than MAX_MS, bigger than MAX_BYTES, or not an
 *   audio type is refused (the bucket and the table refuse it too).
 * - The consent is ticked before any send, and its exact text and version go on the row. The
 *   server compares the text word for word with its own copy (shutdoor_ump_consent).
 * - The review sheet is the owner's (stumpire_testers role 'admin'); its button shows only when the
 *   server says so, and every call behind it checks again.
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

var api = {
  API_VERSION: 1,
  LINES: LINES, CONSENT: CONSENT, CONSENT_V: CONSENT_V, MAX_MS: MAX_MS, MAX_BYTES: MAX_BYTES, MIMES: MIMES,
  CREDIT_MAX: CREDIT_MAX, PENDING_MAX: PENDING_MAX, CALLS: CALLS,
  lineOf: lineOf, baseMime: baseMime, check: check, recorderMime: recorderMime, cleanCredit: cleanCredit,
  linesFor: linesFor, plan: plan,
};
if (NODE) { module.exports = api; return; }

/* ============================ the page ============================ */

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function A() { return window.STD_AUTH || {}; }
function MN() { return window.STD_MENUS; }
function signedIn() { try { return !!(A().state && A().state().signedIn); } catch (e) { return false; } }

/* ---- the record sheet ---------------------------------------------------- */

var R = { i: 0, take: null, rec: null, consent: false, credit: '', busy: false, msg: '', sent: {}, pending: null };

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
  clearTimeout(r.timer); clearInterval(r.tick);
  r.keep = keep !== false;
  try { if (r.mr.state !== 'inactive') r.mr.stop(); } catch (e) {}
}
function closeMic(stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }

function startRec() {
  var md = navigator.mediaDevices;
  if (!md || !md.getUserMedia || typeof MediaRecorder === 'undefined') { R.msg = 'This browser cannot record. Upload a file instead.'; return render(); }
  dropTake(); R.msg = ''; render();
  md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } }).then(function (stream) {
    var type = recorderMime(function (t) { return MediaRecorder.isTypeSupported(t); });
    var mr;
    try { mr = type ? new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 64000 }) : new MediaRecorder(stream); }
    catch (e) { closeMic(stream); R.msg = 'This browser cannot record. Upload a file instead.'; return render(); }
    var parts = [], t0 = 0, rec = { mr: mr, keep: true, timer: 0, tick: 0 };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) parts.push(e.data); };
    mr.onstop = function () {
      closeMic(stream);
      var ms = Math.min(MAX_MS, Date.now() - t0);
      if (rec.keep) {
        var blob = new Blob(parts, { type: mr.mimeType || type || 'audio/webm' });
        setTake(blob, ms, false);
      } else render();
    };
    R.rec = rec;
    mr.start();
    t0 = Date.now();
    rec.timer = setTimeout(function () { stopRec(true); }, MAX_MS);
    rec.tick = setInterval(function () { var b = $('vo-bar'); if (b) b.style.width = Math.min(100, (Date.now() - t0) / MAX_MS * 100) + '%'; }, 50);
    render();
  }).catch(function () {
    R.msg = 'No mic. Allow it in your browser, or upload a file.';
    render();
  });
}
function setTake(blob, ms, upload) {
  dropTake();
  var mime = baseMime(blob.type, blob.name);
  var t = { blob: blob, mime: mime, bytes: blob.size, ms: Math.round(ms), url: URL.createObjectURL(blob), upload: upload };
  var bad = check(t);
  if (bad) { try { URL.revokeObjectURL(t.url); } catch (e) {} R.msg = bad; return render(); }
  R.take = t; R.msg = '';
  render();
}
/* an upload: its length from decoding it, nothing played */
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
    if (!ab) { R.msg = 'That file will not play here. Try another.'; return render(); }
    var blob = mime === f.type ? f : new Blob([f], { type: mime });
    setTake(blob, ab.duration * 1000, true);
  }).catch(function () { R.msg = 'That file will not play here. Try another.'; render(); });
}
function send() {
  var t = R.take, line = LINES[R.i];
  if (!t || !R.consent || R.busy || !A().umpSubmit) return;
  R.busy = true; R.msg = ''; render();
  A().umpSubmit({ line: line.id, blob: t.blob, mime: t.mime, bytes: t.bytes, ms: t.ms, credit: cleanCredit(R.credit), consent: CONSENT, consentVersion: CONSENT_V })
    .then(function (r) {
      R.busy = false;
      if (!r || r.error) { R.msg = r && r.error ? sentence(r.error) : 'That did not send. Try again.'; return render(); }
      R.sent[line.id] = true;
      if (R.pending != null) R.pending++;
      dropTake();
      R.msg = 'Sent. The owner listens to every call.';
      if (R.i < LINES.length - 1) R.i++;
      render(true);
    });
}
function sentence(s) { s = String(s || '').trim(); s = s.charAt(0).toUpperCase() + s.slice(1); return /[.!?]$/.test(s) ? s : s + '.'; }
function go(d) { stopRec(false); dropTake(); R.msg = ''; R.i = Math.max(0, Math.min(LINES.length - 1, R.i + d)); render(); }

function render(keepMsg) {
  var body = $('vo-body');
  if (!body) return;
  if (!signedIn()) {
    body.innerHTML = '<p>Sign in to record a call for the game.</p>' +
      '<p class="quiet">The owner listens to every call. The best ones go in the game.</p>' +
      '<button class="btn go" type="button" id="vo-signin">Sign in</button>';
    $('vo-signin').addEventListener('click', function () { close(); if (MN()) MN().show('auth'); });
    return;
  }
  var line = LINES[R.i], t = R.take, recOn = !!R.rec;
  body.innerHTML =
    '<p class="vo-n">Line ' + (R.i + 1) + ' of ' + LINES.length + (R.sent[line.id] ? ' · sent' : '') + '</p>' +
    '<p class="vo-line" id="vo-line">' + esc(line.text) + '</p>' +
    (line.hint ? '<p class="quiet vo-hint">' + esc(line.hint) + '</p>' : '') +
    '<div class="vo-rec">' +
      '<button class="btn ' + (recOn ? 'go vo-on' : 'go') + '" type="button" id="vo-rec" aria-pressed="' + recOn + '">' + (recOn ? 'Stop' : t ? 'Record again' : 'Record') + '</button>' +
      '<label class="btn ghost vo-up" for="vo-file">Upload a file</label><input type="file" id="vo-file" accept="audio/*" hidden>' +
    '</div>' +
    '<div class="vo-meter" aria-hidden="true"><i id="vo-bar"' + (recOn ? '' : ' style="width:0"') + '></i></div>' +
    '<p class="quiet">Up to ' + MAX_MS / 1000 + ' seconds. Say it like you mean it.</p>' +
    (t ? '<audio class="vo-play" id="vo-play" controls preload="auto" src="' + esc(t.url) + '"></audio>' : '') +
    '<label class="vo-ok"><input type="checkbox" id="vo-consent"' + (R.consent ? ' checked' : '') + '><span>' + esc(CONSENT) + '</span></label>' +
    '<label class="vo-credit">Credit me as (optional)<input type="text" id="vo-cr" maxlength="' + CREDIT_MAX + '" autocomplete="nickname" value="' + esc(R.credit) + '"></label>' +
    '<p class="au-err" id="vo-msg" role="status">' + esc(R.msg) + '</p>' +
    '<div class="vo-act">' +
      '<button class="btn ghost" type="button" id="vo-prev"' + (R.i === 0 ? ' disabled' : '') + '>Back</button>' +
      '<button class="btn go" type="button" id="vo-send"' + (t && R.consent && !R.busy && !recOn ? '' : ' disabled') + '>' + (R.busy ? 'Sending' : 'Send this call') + '</button>' +
      '<button class="btn ghost" type="button" id="vo-next"' + (R.i === LINES.length - 1 ? ' disabled' : '') + '>Skip</button>' +
    '</div>' +
    (R.pending != null ? '<p class="quiet" id="vo-pending">' + (R.pending === 1 ? '1 call waits' : R.pending + ' calls wait') + ' for review.</p>' : '');
  $('vo-rec').addEventListener('click', function () { if (R.rec) stopRec(true); else startRec(); });
  $('vo-file').addEventListener('change', function (e) { stopRec(false); fromFile(e.target.files && e.target.files[0]); e.target.value = ''; });
  $('vo-consent').addEventListener('change', function (e) { R.consent = !!e.target.checked; var s = $('vo-send'); if (s) s.disabled = !(R.take && R.consent && !R.busy && !R.rec); });
  $('vo-cr').addEventListener('input', function (e) { R.credit = e.target.value; });
  $('vo-prev').addEventListener('click', function () { go(-1); });
  $('vo-next').addEventListener('click', function () { go(1); });
  $('vo-send').addEventListener('click', send);
  if (!keepMsg && R.msg && /^Sent/.test(R.msg)) R.msg = '';
}
function open() {
  R.msg = ''; R.busy = false; R.pending = null;
  render();
  if (MN()) MN().open('sheet-voices', function () { stopRec(false); dropTake(); });
  if (signedIn() && A().umpMine) A().umpMine().then(function (rows) { if (Array.isArray(rows)) { R.pending = rows.length; render(true); } });
}
function close() { if (MN() && MN().current() === 'sheet-voices') MN().close(); }

/* ---- the owner's review sheet --------------------------------------------- */

var Q = { tab: 'pending', rows: null, urls: {}, msg: '' };
function loadQueue() {
  Q.rows = null; Q.msg = ''; renderQueue();
  var a = A();
  if (!a.umpQueue) { Q.rows = []; Q.msg = 'Reviews are not available here.'; return renderQueue(); }
  a.umpQueue(Q.tab).then(function (r) {
    if (!r || r.error) { Q.rows = []; Q.msg = r && r.error ? sentence(r.error) : 'Could not load the calls.'; return renderQueue(); }
    Q.rows = Array.isArray(r.data) ? r.data : [];
    var paths = Q.rows.map(function (x) { return x.path; });
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
      return '<li class="vr-row" data-id="' + esc(x.id) + '"><div class="vr-h"><b>' + esc(ln ? ln.text : x.line) + '</b><small>' +
        esc([who, when(x.createdAt), x.ms ? (x.ms / 1000).toFixed(1) + ' s' : ''].filter(Boolean).join(' · ')) + '</small></div>' +
        (url ? '<audio controls preload="none" src="' + esc(url) + '"></audio>' : '<p class="quiet">Loading the clip.</p>') +
        '<div class="vr-act">' +
          (x.status !== 'approved' ? '<button class="btn go" type="button" data-vr="approved">Approve</button>' : '') +
          (x.status !== 'rejected' ? '<button class="btn ghost" type="button" data-vr="rejected">Reject</button>' : '') +
        '</div></li>';
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
    var b = e.target.closest('[data-vr]'), row = e.target.closest('.vr-row');
    if (!b || !row || b.disabled) return;
    b.disabled = true;
    A().umpReview(row.getAttribute('data-id'), b.getAttribute('data-vr')).then(function (r) {
      if (!r || r.error) { b.disabled = false; Q.msg = r && r.error ? sentence(r.error) : 'That did not save.'; return renderQueue(); }
      Q.rows = Q.rows.filter(function (x) { return x.id !== row.getAttribute('data-id'); });
      Q.msg = '';
      renderQueue();
    });
  });
}
function openReview() {
  wireQueue();
  Q.tab = 'pending';
  if (MN()) MN().open('sheet-ump-review');
  loadQueue();
}

/* the settings sheet's buttons: record for everyone, review for the owner once the server says so */
function settingsRows(box) {
  if (!box) return;
  var h = '<button type="button" class="set-row set-go" id="set-voices"><span><b>Voice of the ump</b><small>Record a call. The best ones go in the game.</small></span><i class="chev" aria-hidden="true"></i></button>' +
    '<button type="button" class="set-row set-go" id="set-ump-review" hidden><span><b>Review ump calls</b><small>Only you see this.</small></span><i class="chev" aria-hidden="true"></i></button>';
  box.insertAdjacentHTML('beforeend', h);
  $('set-voices').addEventListener('click', open);
  $('set-ump-review').addEventListener('click', openReview);
  if (signedIn() && A().umpOwner) A().umpOwner().then(function (yes) { var b = $('set-ump-review'); if (b && yes === true) b.hidden = false; });
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
