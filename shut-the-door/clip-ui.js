/* Shut The Door: the clip of one pitch (the owner, 2026-11-05: "If you had a sick pitch and want to
 * share it after, you should be able to clip it and share it").
 *
 * window.STD_CLIP_UI. Nothing here runs until a player taps a pitch's Clip on the result, or opens a
 * clip link (?clip=, clip.js). Then:
 *   THE REPLAY. The pitch again from the stored calls (api.js clip: its own outing, in memory, never
 *     stored or posted), on the mound's own stage: its canvas moves into #s-clip for the clip and back
 *     after it, so there is never a second WebGL context. The stage plays the pitch exactly as the
 *     game does (stage.play: the pitcher's eye, then the broadcast of a ball in play). The only things
 *     set on it from here are the late game the fielders read (sitBefore's lastN, runsIn and halfAt,
 *     put back to a fresh page's after) and a hook on its render, removed after.
 *   THE VIEW. What the player sees is what the video is: each frame the stage draws is copied onto one
 *     2D canvas (#cl-out) with the overlay on it (the wordmark, then a lower third: the pitcher, the
 *     count, the pitch, and once it is seen, its speed and the result, then runthe.gg/shut-the-door).
 *     Two transparent [data-hud] boxes mark the overlay's place, so the stage frames the set clear of it.
 *   THE VIDEO. From a tap on Clip the replay is recorded off that canvas (captureStream +
 *     MediaRecorder, mp4 where the browser makes it, else webm), the pitch and its play, a few seconds.
 *     Then SHARE VIDEO hands the file to the share sheet (navigator.share files) inside its own tap,
 *     or saves it where files cannot be shared. Without a recorder, or if it fails, the link is all.
 *   THE LINK. ?clip= opens this screen over the home with PLAY THE PITCH and PLAY TODAY'S DAILY. It
 *     plays only on a tap, writes nothing, and shows nothing of any day's real game.
 * THE AT BAT (the owner, 2026-11-06: "share clips of any pitch or at bat"). An at bat's Clip on the
 *   result plays every pitch of that plate appearance in order (api.js clip with from: each pitch as
 *   the one pitch's clip has it), on the same stage, overlay, recording and share sheet. Between
 *   pitches it cuts straight to the next set: no walk-in, no reset beat. The lower third shows each
 *   pitch's count as it is thrown and its result once seen, then ends on the at bat's (postgame.js
 *   atBats, the card's own word). Its link (?clip=2...) plays the at bat.
 * No grade and no band: the clip is the pitch, not its verdict. */
(function () {
'use strict';
var D = null;          // what ui.js lends (init)
var CL = {             // the clip on screen
  on: false, from: null, data: null, link: '', playing: null, rec: null, file: null, url: null,
  revealed: false, phase: '', closeAsked: false, hook: null, raf: 0, n: 0,
  list: [], i: 0, end: false, played: 0,   // the pitches it plays (one, or an at bat's), the one on screen
};
var MAX_SIDE = 1280;   // the video's long side, px
var LEAD_MS = 500, TAIL_MS = 600;
var GAP_MS = 350;      // an at bat: the result held this long, then the cut to the next set
var END_MS = 1100;     // an at bat: its result on the lower third at the end

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---- the recorder: which video this browser makes ------------------------------------------- */
var TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
function recType() {
  try {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    for (var i = 0; i < TYPES.length; i++) if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(TYPES[i])) return TYPES[i];
  } catch (e) {}
  return null;
}
function extOf(type) { return /mp4/.test(type) ? 'mp4' : 'webm'; }

/* ---- what the clip says ------------------------------------------------------------------- */
function typeName(scn, t) {
  var a = (scn.pitcher.arsenal || []).filter(function (x) { return x.type === t; })[0];
  return a && a.name ? cap(a.name) : t;
}
function batterOf(scn, i) { var bs = scn.batters; return bs[((i % bs.length) + bs.length) % bs.length]; }
var OUTS = ['No outs', 'One out', 'Two outs'];
/* what the lower third says of one pitch (x: { before, final, after }) */
function facts(scn, x) {
  var b4 = x.before, pr = x.final, bat = batterOf(scn, b4.batterIndex);
  var t = D.playText(pr, bat, x.after);
  var cnt = pr.countBefore ? pr.countBefore.b + '-' + pr.countBefore.s : '';
  var v = pr.velo != null && isFinite(pr.velo) ? Math.round(pr.velo) + ' mph' : '';
  var abs = pr.challenge ? (pr.challenge.overturned ? 'Overturned' : 'Call stands') : '';
  return {
    pitcher: scn.pitcher.name || '', batter: bat.name || '', short: D.lastName(bat.name || ''),
    n: pr.n, type: typeName(scn, pr.call.type), color: D.typeColor(pr.call.type), count: cnt, velo: v,
    outs: OUTS[b4.outs] || '', tag: cap(t.tag), abs: abs, club: (scn.pitcher.teamColors || [])[0] || '#ff4f1f',
    title: scn.title || '', label: scn.preview ? 'Preview' : '#' + scn.number,
  };
}
/* the pitches a clip plays: one, or each of an at bat's */
function listOf(d) { return d.pitches && d.pitches.length ? d.pitches : [{ before: d.before, pr: d.pr, final: d.final, after: d.after }]; }
/* the at bat as the result's card has it: its end in words (postgame.js atBats on its own pitches) */
function abEnd(d) {
  var PG = window.STD_POSTGAME, fin = CL.list.map(function (x) { return x.final; });
  var ab = PG && PG.atBats ? PG.atBats(fin, d.scn)[0] : null;
  return ab && ab.code ? ab.word : '';
}
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
/* the facts on screen: the pitch in hand, and for an at bat where it is in it and, at the end, how
   the at bat ended */
function factsNow() {
  var f = CL.pf[CL.i];
  if (!CL.ab) return f;
  var K = CL.list.length;
  var g = Object.assign({}, f, { of: 'Pitch ' + (CL.i + 1) + ' of ' + K });
  if (CL.end) { g.of = plural(K, 'pitch', 'pitches'); if (CL.endWord) g.tag = CL.endWord; g.abs = ''; }
  return g;
}

/* ---- the overlay, on the canvas ---------------------------------------------------------- */
function fit(ctx, text, max, size, font) {
  var s = size;
  ctx.font = font.replace('$', s);
  while (s > 8 && ctx.measureText(text).width > max) { s -= 1; ctx.font = font.replace('$', s); }
  return s;
}
/* one unit of the overlay: a hundredth of the short side, smaller on a wide frame (a desk's) */
function unitOf(W, H) { return Math.min(W, H) / 100 * (W > H * 1.05 ? 0.62 : 1); }
function overlay(ctx, W, H, f, shown) {
  var u = unitOf(W, H);
  var pad = 4.2 * u;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  /* the wordmark, top left: SHUT THE DOOR in Anton, DOOR in signal */
  var wm = 5.4 * u;
  ctx.font = '400 ' + wm + 'px Anton, Impact, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = u;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('SHUT THE ', pad, pad + wm);
  var w0 = ctx.measureText('SHUT THE ').width;
  ctx.fillStyle = '#ff4f1f';
  ctx.fillText('DOOR', pad + w0, pad + wm);
  ctx.shadowBlur = 0;
  /* the lower third: an ink plate, the club's colour on its edge */
  var lh = 22 * u, x = pad, y = H - pad - lh, w = W - 2 * pad;
  ctx.fillStyle = 'rgba(11,15,23,.88)';
  ctx.fillRect(x, y, w, lh);
  ctx.fillStyle = f.club;
  ctx.fillRect(x, y, 1.2 * u, lh);
  var tx = x + 4 * u, tw = w - 8 * u;
  ctx.fillStyle = '#ffffff';
  fit(ctx, f.pitcher, tw * 0.62, Math.round(4.6 * u), '700 $px Inter, system-ui, sans-serif');
  ctx.fillText(f.pitcher, tx, y + 6.4 * u);
  /* the count, right */
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9aa3b5';
  ctx.font = '600 ' + Math.round(3.6 * u) + 'px Inter, system-ui, sans-serif';
  ctx.fillText([f.count, f.outs].filter(Boolean).join(' · '), x + w - 4 * u, y + 6.4 * u);
  ctx.textAlign = 'left';
  /* the pitch: its colour chip, its name, its speed once it is seen */
  var py = y + 11.6 * u;
  ctx.fillStyle = f.color;
  ctx.fillRect(tx, py - 3.1 * u, 1.4 * u, 3.6 * u);
  var l2 = [f.type, shown ? f.velo : '', 'to ' + f.short].filter(Boolean).join(' · '), ofW = 0;
  /* an at bat: where this pitch is in it, right */
  if (f.of) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9aa3b5';
    ctx.font = '600 ' + Math.round(3.2 * u) + 'px Inter, system-ui, sans-serif';
    ctx.fillText(f.of, x + w - 4 * u, py);
    ofW = ctx.measureText(f.of).width + 3 * u;
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = '#e6e9ef';
  fit(ctx, l2, tw - 2.6 * u - ofW, Math.round(3.6 * u), '600 $px Inter, system-ui, sans-serif');
  ctx.fillText(l2, tx + 2.6 * u, py);
  /* the result, big, once the player has seen it (as the game's own reveal) */
  var ry = y + lh - 3.4 * u;
  if (shown) {
    ctx.fillStyle = '#ff4f1f';
    var rs = fit(ctx, f.tag.toUpperCase(), tw * 0.7, Math.round(7.2 * u), '400 $px Anton, Impact, sans-serif');
    ctx.fillText(f.tag.toUpperCase(), tx, ry);
    if (f.abs) {
      var aw = ctx.measureText(f.tag.toUpperCase()).width;
      ctx.fillStyle = '#9aa3b5';
      ctx.font = '600 ' + Math.round(3.2 * u) + 'px Inter, system-ui, sans-serif';
      ctx.fillText(f.abs, tx + aw + 2 * u, ry - 0.2 * rs);
    }
  }
  /* the mark, bottom right */
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9aa3b5';
  ctx.font = '600 ' + Math.round(3 * u) + 'px Inter, system-ui, sans-serif';
  ctx.fillText('runthe.gg/shut-the-door', x + w - 4 * u, ry);
  ctx.restore();
}

/* one frame: the stage's canvas as it was just drawn, then the overlay */
function composite() {
  var out = $('cl-out'), src = $('m-canvas');
  if (!out || !src || !CL.data) return;
  var ctx = out.getContext('2d');
  ctx.fillStyle = '#0b0f17';
  ctx.fillRect(0, 0, out.width, out.height);
  try { if (src.width && src.height) ctx.drawImage(src, 0, 0, out.width, out.height); } catch (e) {}
  overlay(ctx, out.width, out.height, factsNow(), CL.revealed);
}

/* ---- the stage ----------------------------------------------------------------------------- */
function sizeOut() {
  var box = $('cl-stage'), out = $('cl-out');
  var w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return;
  var k = Math.min(window.devicePixelRatio || 1, 2), long = Math.max(w, h) * k;
  if (long > MAX_SIDE) k *= MAX_SIDE / long;
  /* even sizes: the video encoders want them */
  out.width = Math.max(2, Math.round(w * k / 2) * 2);
  out.height = Math.max(2, Math.round(h * k / 2) * 2);
  /* the overlay's place in css px, for the stage's frame (its [data-hud] boxes) */
  var u = unitOf(w, h), pad = 4.2 * u, wm = $('cl-wm-box'), l3 = $('cl-l3-box');
  wm.style.cssText = 'left:' + pad + 'px;top:' + pad + 'px;width:' + 34 * u + 'px;height:' + 6.4 * u + 'px';
  l3.style.cssText = 'left:' + pad + 'px;right:' + pad + 'px;bottom:' + pad + 'px;height:' + 22 * u + 'px';
}
function realStage() { var sc = D.scene(); return sc && sc.is3d ? (sc.real || null) : null; }
/* the stage's render, copied onto the clip's canvas after every draw (and nothing else changed) */
function hookOn() {
  var st = realStage();
  if (!st || CL.hook) return;
  var own = st.render;
  CL.hook = st;
  st.render = function () { own.apply(st, arguments); if (CL.on) composite(); };
}
function hookOff() {
  if (CL.hook) { delete CL.hook.render; CL.hook = null; }
  if (CL.raf) { cancelAnimationFrame(CL.raf); CL.raf = 0; }
}
/* the 2D drawing (no WebGL): copied every frame while it plays */
function loop2d(on) {
  if (CL.raf) { cancelAnimationFrame(CL.raf); CL.raf = 0; }
  if (!on || realStage()) return;
  var tick = function () { composite(); CL.raf = requestAnimationFrame(tick); };
  CL.raf = requestAnimationFrame(tick);
}
function moveCanvas(intoClip) {
  var c = $('m-canvas');
  if (!c) return;
  if (intoClip) $('cl-stage').insertBefore(c, $('cl-stage').firstChild);
  else $('m-scene').insertBefore(c, $('m-scene').firstChild);
}
/* the late game the fielders read before this pitch (stage.js sitBefore): the inning and our lead
   as they stood. After the clip, a fresh page's (the next pitch on the mound counts from its own) */
function sitFor(st, b4) {
  if (!st) return;
  st.lastN = 0; st.runsIn = 0;
  st.halfAt = b4 && b4.half && b4.score ? { inning: b4.half.inning, lead: b4.score.us - b4.score.them } : null;
}
function setFrame(sc) { if (sc.draw) sc.draw(sc.is3d ? undefined : { pitcher: 'set', batter: 'stance', umpire: 'set' }); }
/* the set for pitch i of the clip: its aim, the pitcher set, the hitter in his stance (a cut) */
function cue(i) {
  var sc = D.scene(), x = CL.list[i];
  CL.i = i;
  if (sc.setTarget) sc.setTarget(x.pr.call.cell, x.pr.call.at || null);
  setFrame(sc);
}
function setUp(d) {
  var sc = D.scene(), x = CL.list[0];
  moveCanvas(true);
  sc.setScenario(d.scn);
  sc.setBatter(batterOf(d.scn, x.before.batterIndex));
  if (sc.setTarget) sc.setTarget(x.pr.call.cell, x.pr.call.at || null);
  sizeOut();
  sc.layout();
  hookOn();
  var ready = sc.arrived ? sc.arrived.then(function (st) { return st.ready; }) : Promise.resolve();
  return ready.then(function () {
    hookOn();
    sizeOut();
    sc.layout();
    setFrame(sc);
    composite();
  });
}

/* ---- the play, and the recording ---------------------------------------------------------- */
function say(t) { $('cl-say').textContent = t || ''; }
function phase(p) {
  CL.phase = p;
  $('s-clip').dataset.phase = p;
  var busy = p === 'playing' || p === 'loading';
  $('cl-again').disabled = busy;
  $('cl-again').hidden = p === 'idle';
  $('cl-video').disabled = busy || !CL.file;
  $('cl-video').hidden = !CL.file && !(busy && CL.rec);
  $('cl-play').hidden = p !== 'idle';
}
/* one pitch of the clip on the stage, from its set to the end of its play */
function playOne(i) {
  var d = CL.data, sc = D.scene(), x = CL.list[i];
  if (CL.ab) cue(i);
  CL.i = i; CL.revealed = false;
  composite();
  sitFor(realStage(), x.before);
  var hooks = {
    call: function () { CL.revealed = true; composite(); },
    land: function () {},
    sound: D.pitchSounds(x.pr),
    field: function () {},
  };
  var opts = { pr: x.pr, ap: (d.scn.pitcher.arsenal || []).filter(function (a) { return a.type === x.pr.call.type; })[0], quick: false, hooks: hooks };
  return (sc.is3d ? sc.play(opts) : D.play2d(sc, opts)).then(function () {
    CL.revealed = true;
    CL.played++;
    composite();
  });
}
function play(record) {
  if (CL.playing) return CL.playing;
  var d = CL.data, my = CL.n, last = CL.list.length - 1;
  CL.revealed = false; CL.end = false; CL.played = 0; CL.i = 0;
  composite();
  var type = record ? recType() : null, chunks = [], rec = null, stopped = null;
  if (type) {
    try {
      var stream = $('cl-out').captureStream(30);
      rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6000000 });
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      stopped = new Promise(function (res) { rec.onstop = res; rec.onerror = res; });
      rec.start(250);
    } catch (e) { rec = null; if (window.console) console.warn('the clip could not record', e); }
  }
  CL.rec = rec;
  phase('playing');
  say(rec ? 'Recording the clip.' : '');
  loop2d(true);
  if (CL.ab) cue(0);
  /* each pitch in turn; between two, the result a beat and then the cut to the next set */
  var chain = wait(rec ? LEAD_MS : 0);
  CL.list.forEach(function (x, i) {
    chain = chain.then(function () { if (my === CL.n) return playOne(i); })
      .then(function () { return i < last && my === CL.n ? wait(GAP_MS) : null; });
  });
  CL.playing = chain.then(function () {
    if (CL.ab) { CL.end = true; composite(); }
    return wait(rec ? (CL.ab ? END_MS : TAIL_MS) : (CL.ab ? 400 : 0));
  }).then(function () {
    loop2d(false);
    if (!rec) return null;
    try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
    return stopped.then(function () {
      if (my !== CL.n) return;
      var blob = chunks.length ? new Blob(chunks, { type: type.split(';')[0] }) : null;
      if (!blob || !blob.size) throw new Error('the recording is empty');
      CL.file = new File([blob], 'shut-the-door-' + (CL.ab ? 'at-bat-' + d.from : 'pitch-' + d.pr.n) + '.' + extOf(type), { type: type.split(';')[0] });
      if (CL.url) URL.revokeObjectURL(CL.url);
      CL.url = URL.createObjectURL(blob);
    });
  }).catch(function (e) {
    if (window.console) console.warn('the clip did not record', e);
    CL.file = null;
  }).then(function () {
    CL.playing = null;
    CL.rec = null;
    if (my !== CL.n) return;
    phase('done');
    if (record && !CL.file) say(type ? 'The video did not record. The link still works.' : 'This browser cannot record video. Share the link instead.');
    else say(CL.file ? 'Clip ready.' : '');
    if (CL.closeAsked) close();
  });
  return CL.playing;
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---- sharing ------------------------------------------------------------------------------- */
function linkUrl() { return location.origin + location.pathname + '?clip=' + CL.link; }
function touch() { return !!(window.matchMedia && matchMedia('(pointer: coarse)').matches); }
function shareVideo() {
  var f = CL.file;
  if (!f) return;
  var can = false;
  try { can = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) {}
  if (can && touch()) {
    navigator.share({ files: [f], title: 'Shut The Door', text: shareLine() + ' ' + linkUrl() }).catch(function () {});
    return;
  }
  var a = document.createElement('a');
  a.href = CL.url; a.download = f.name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  D.toast('Video saved.');
}
/* what the share says of the clip: the pitch and its result, or the at bat and how it ended */
function shareLine() {
  var f = CL.facts;
  if (!CL.ab) return 'Pitch ' + f.n + '. ' + f.tag + '.';
  return f.short + ' at bat. ' + (CL.endWord || f.tag) + '.';
}
function shareLink() {
  var u = linkUrl();
  if (navigator.share && touch()) { navigator.share({ url: u, title: 'Shut The Door: ' + (CL.ab ? CL.facts.short + ' at bat' : 'pitch ' + CL.facts.n) }).catch(function () {}); return; }
  D.copy(u, 'Link copied.');
}

/* ---- the screen ------------------------------------------------------------------------------ */
function paint(fromLink) {
  var f = CL.facts;
  $('cl-eyebrow').textContent = 'Clip · ' + f.label + ' · ' + f.title;
  if (CL.ab) {
    $('cl-head').textContent = 'At bat: ' + f.batter;
    $('cl-sub').textContent = f.pitcher + ' to ' + f.short + '. ' + [plural(CL.list.length, 'pitch', 'pitches'), f.outs].filter(Boolean).join(' · ') + '.';
  } else {
    $('cl-head').textContent = 'Pitch ' + f.n + ': ' + f.type;
    $('cl-sub').textContent = f.pitcher + ' to ' + f.batter + '. ' + [f.count ? f.count + ' count' : '', f.outs].filter(Boolean).join(' · ') + '.';
  }
  $('cl-play').textContent = CL.ab ? 'Play the at bat' : 'Play the pitch';
  $('cl-daily').hidden = !fromLink;
  $('cl-close').setAttribute('aria-label', fromLink ? 'Home' : 'Back to the result');
}
function open(d, link, from) {
  CL.n++;
  CL.on = true; CL.from = from; CL.data = d; CL.link = link; CL.file = null; CL.closeAsked = false;
  if (CL.url) { URL.revokeObjectURL(CL.url); CL.url = null; }
  CL.list = listOf(d); CL.ab = !!(d.pitches && d.pitches.length); CL.i = 0; CL.end = false; CL.played = 0;
  CL.pf = CL.list.map(function (x) { return facts(d.scn, x); });
  CL.facts = CL.pf[0];
  CL.endWord = CL.ab ? abEnd(d) : '';
  say(CL.ab ? 'Setting up the at bat.' : 'Setting up the pitch.');
  paint(from === 'link');
  D.show('s-clip');
  phase('loading');
  var fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('400 40px Anton'), document.fonts.load('700 20px Inter'), document.fonts.load('600 20px Inter')]).catch(function () {}) : Promise.resolve();
  var my = CL.n;
  return Promise.all([setUp(d), fonts]).then(function () {
    if (my !== CL.n || !CL.on) return;
    composite();
    /* from the result the tap on Clip is the ask: it plays and records at once. A link waits for
       PLAY THE PITCH */
    if (from === 'link') { phase('idle'); say(''); return; }
    return play(true);
  });
}
/* from the result: pitch n of the outing on the page, or with from, its at bat of pitches from to n */
function fromOuting(outingId, n, from) {
  var c = D.api().clipSpec ? D.api().clipSpec(outingId, n, from) : null;
  if (!c) { D.toast(from != null ? 'That at bat cannot be clipped.' : 'That pitch cannot be clipped.'); return; }
  D.api().clip(c.spec).then(function (d) { return open(d, c.link, 'result'); }).catch(function (e) {
    if (window.console) console.warn(e);
    D.toast('That clip did not load.');
    if (CL.on) close();
  });
}
/* from a link: ?clip= */
function fromLink(text) {
  var spec = window.STD_CLIP ? window.STD_CLIP.decode(text) : null;
  if (!spec) { dropParam(); D.toast('That clip link did not work.'); return; }
  D.api().clip(spec).then(function (d) { return open(d, text, 'link'); }).catch(function (e) {
    if (window.console) console.warn(e);
    dropParam();
    D.toast('That clip link did not work.');
    if (CL.on) close();
  });
}
/* the address without ?clip=, so a reload or the mound's home (a fresh page) never reopens it */
function dropParam() {
  try {
    var u = new URL(location.href);
    if (!u.searchParams.has('clip')) return;
    u.searchParams.delete('clip');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  } catch (e) {}
}
function close() {
  if (!CL.on) return;
  /* a play in flight finishes first (the tap that asked already skipped it to its end) */
  if (CL.playing) { CL.closeAsked = true; return; }
  var from = CL.from;
  CL.on = false; CL.n++;
  hookOff();
  sitFor(realStage(), null);
  var sc = D.scene();
  if (sc && sc.setTarget) sc.setTarget(null);
  moveCanvas(false);
  if (CL.url) { URL.revokeObjectURL(CL.url); CL.url = null; }
  CL.file = null; CL.data = null; CL.list = []; CL.ab = false;
  if (from === 'link') { dropParam(); D.home(); } else D.show('s-result');
}
function playDaily() {
  if (CL.playing) return;
  CL.from = 'link';
  close();
  D.playDaily();
}

function init(deps) {
  D = deps;
  $('cl-close').addEventListener('click', close);
  $('cl-again').addEventListener('click', function () { if (CL.on && !CL.playing) play(!CL.file); });
  $('cl-play').addEventListener('click', function () { if (CL.on && !CL.playing) play(true); });
  $('cl-video').addEventListener('click', shareVideo);
  $('cl-link').addEventListener('click', shareLink);
  $('cl-daily').addEventListener('click', playDaily);
  window.addEventListener('resize', function () { if (CL.on && !CL.playing) { var sc = D.scene(); sc.layout(); sizeOut(); if (sc.is3d) sc.draw(); composite(); } });
}

window.STD_CLIP_UI = {
  init: init, fromOuting: fromOuting, fromLink: fromLink, close: close,
  isOpen: function () { return CL.on; },
  /* for the browser check: what the last play showed (pitches played, the at bat's end on screen) */
  shown: function () { return { ab: !!CL.ab, pitches: CL.list.length, played: CL.played, end: CL.end ? (CL.endWord || '') : null, i: CL.i }; },
  lastLink: function () { return CL.link ? linkUrl() : null; },
  canRecord: function () { return !!recType(); },
};
})();
