/* Shut The Door: the release meter on the page (the owner, 2026-10-22: "the pitch meter still is the
 * same. It doesn't look updated").
 *
 * window.STD_METER_UI, after meter.js. meter.js keeps the numbers (the sweep, the mark, the window,
 * q, the word); this file is only how the meter looks and takes the tap. The mechanics are meter
 * pitching's (a broadcast baseball game, a golf swing meter), never their pixel style: the Strike
 * Zone brand, its tokens and its two faces.
 *
 * THE PANEL. After the tap on throw it takes over the pitch buttons and the throw button as one
 * night panel (it is placed over them, so the scene above never moves), big enough to hit without
 * looking. The head says the verb (release, or shut it), the pitch and the spot. No speed: it is
 * revealed after the throw (the owner, 2026-10-23).
 *
 * TWO BARS, ONE WHEN EFFORT IS NOT A RULE YET.
 *   power     (top) shown only when STD_METER.POWER (= EFFORT) === true. The player's word for the e stop. A fill runs left to right through
 *             three zones, soft, normal and max, and back; the tap stops it. e is where it stopped,
 *             0..1.
 *   accuracy  (bottom) the needle sweeps; the tap stops it. The soft band is a release tighter than
 *             his command, the bright band the best release. With effort, the bright band is
 *             STD_METER.windowOf(e) ([lo, hi], fractions of the bar) and q is qOf(err, command, e).
 *   Without effort the accuracy bar is the whole meter, with today's bands and reward unchanged
 *   (bandsFor(command), qOf(err, command)). Nothing inert is shown.
 *
 * THE STOP. The needle (or the fill) locks where it was stopped: a short flash, a ring that opens
 * from the lock, the bar's value held. The word after the release is meter.js wordOf, execution
 * only, never a grade, stamped in the head in place of the call. No popup: it sits in the panel,
 * which goes away when the pitch is over.
 *
 * create(el) -> { el, run(opts), cancel(), hide(), running(), stage() }
 *   run({ command, pitch, verb, label, practice, repeat, onSnap, onStage }) resolves
 *   { q, err, word, e } on the last stop (e only with effort), or null when cancelled.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT, MT = window.STD_METER;
if (!MT) return;

var LOCK_MS = 260;          // the pause between the effort stop and the accuracy needle, so the lock is seen
var GUARD_MS = 120;         // a tap this soon after a stage starts is the tap that started it, or a bounce

function effortOn() { return MT.EFFORT === true; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pct(x) { return (Math.max(0, Math.min(1, x)) * 100).toFixed(2) + '%'; }

/* effort at t ms: meter.js's own sweep when it has one, else back and forth over EFFORT_SWEEP_MS */
function effortAt(t) {
  if (typeof MT.effortAt === 'function') return MT.effortAt(t);
  var ph = (t / (MT.EFFORT_SWEEP_MS || 900)) % 2, e = ph < 1 ? ph : 2 - ph;
  return C.effortE ? C.effortE(e) : Math.round(e * 100) / 100;
}
/* the two bands on the bar, [lo, hi] as fractions: the soft one from bandsFor, the bright one from
   windowOf(e) when effort is a rule (and gives a sane band), else bandsFor too */
function bandsOf(command, e) {
  var b = e == null ? MT.bandsFor(command) : MT.bandsFor(command, e);
  var good = [MT.MARK - b.good, MT.MARK + b.good], best = [MT.MARK - b.best, MT.MARK + b.best];
  if (e != null && typeof MT.windowOf === 'function') {
    var w = MT.windowOf(e, command);
    if (w && w.length === 2 && w[0] >= 0 && w[1] <= 1 && w[0] < w[1]) best = [w[0], w[1]];
  }
  return { good: good, best: best };
}
function zoneOf(e) { return e < 1 / 3 ? 'soft' : e < 2 / 3 ? 'normal' : 'max'; }

function create(el) {
  el.classList.add('relm');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '-1');
  el.innerHTML =
    '<div class="rm-head"><b class="rm-verb"></b><span class="rm-call"></span><span class="rm-word" aria-live="polite"></span></div>' +
    '<div class="rm-row rm-eff">' +
      '<span class="rm-lbl">power</span>' +
      '<div class="rm-track rm-etrack"><i class="rm-efill"></i>' +
        '<span class="rm-zones"><b data-z="soft">soft</b><b data-z="normal">normal</b><b data-z="max">max</b></span>' +
        '<i class="rm-eneedle"></i><i class="rm-lock"></i></div>' +
    '</div>' +
    '<div class="rm-row rm-acc">' +
      '<span class="rm-lbl">accuracy</span>' +
      '<div class="rm-track rm-atrack"><i class="rm-good"></i><i class="rm-best"></i><i class="rm-mark"></i>' +
        '<i class="rm-needle"></i><i class="rm-lock"></i></div>' +
    '</div>';
  var q = function (s) { return el.querySelector(s); };
  var verb = q('.rm-verb'), call = q('.rm-call');
  var effRow = q('.rm-eff'), efill = q('.rm-efill'), eneedle = q('.rm-eneedle'), elock = q('.rm-eff .rm-lock');
  var needle = q('.rm-needle'), good = q('.rm-good'), best = q('.rm-best'), mark = q('.rm-mark'), alock = q('.rm-acc .rm-lock'), word = q('.rm-word');
  var live = null;

  function setStage(s) {
    el.dataset.stage = s;
    el.setAttribute('aria-label', s === 'effort' ? 'Power. Tap to set it.' : 'Release. Tap when the needle is in the bright band.');
    if (live && live.opts.onStage) live.opts.onStage(s);
  }
  function placeBands(e) {
    var b = bandsOf(live.opts.command, e);
    good.style.left = pct(b.good[0]); good.style.width = pct(b.good[1] - b.good[0]);
    best.style.left = pct(b.best[0]); best.style.width = pct(b.best[1] - b.best[0]);
    mark.style.left = pct(MT.MARK);
  }
  function placeEffort(e) {
    efill.style.width = pct(e);
    eneedle.style.left = pct(e);
    el.dataset.zone = zoneOf(e);
  }
  function placeNeedle(pos) { needle.style.left = pct(pos); }
  function lockAt(lockEl, pos) {
    lockEl.style.left = pct(pos);
    lockEl.classList.remove('go'); void lockEl.offsetWidth; lockEl.classList.add('go');
  }
  function tick(now) {
    if (!live || live.done) return;
    var t = Math.max(0, now - live.t0);
    if (live.stage === 'effort') placeEffort(effortAt(t));
    else if (live.stage === 'acc') placeNeedle(MT.needleAt(t).pos);
    live.raf = requestAnimationFrame(tick);
  }
  function startAcc() {
    if (!live) return;
    live.stage = 'acc';
    live.t0 = performance.now();
    placeBands(live.e);
    placeNeedle(0);
    setStage('acc');
  }
  function stop(ts) {
    if (!live || live.done) return;
    var t = (ts || performance.now()) - live.t0;
    if (t < GUARD_MS) return;
    if (live.stage === 'effort') {
      var e = effortAt(t);
      live.e = e;
      live.stage = 'lock';
      placeEffort(e);
      lockAt(elock, e);
      el.classList.add('is-edone');
      live.lockT = setTimeout(startAcc, LOCK_MS);
      if (live.opts.onStage) live.opts.onStage('acc');
      return;
    }
    if (live.stage !== 'acc') return;
    live.done = true;
    cancelAnimationFrame(live.raf);
    var n = MT.needleAt(t);
    placeNeedle(n.pos);
    lockAt(alock, n.pos);
    var err = MT.errAt(t);
    var qq = live.e == null ? MT.qOf(err, live.opts.command) : MT.qOf(err, live.opts.command, live.e);
    var w = MT.wordOf(qq, err);
    el.classList.add('is-done');
    el.classList.toggle('is-best', qq >= MT.BEST_Q);
    el.classList.toggle('is-good', qq >= MT.GOOD_Q && qq < MT.BEST_Q);
    var extra = live.opts.practice && C.spreadOf ? ' · miss ' + C.spreadOf(qq, live.opts.repeat).toFixed(2) + 'x' : '';
    word.textContent = w + extra;
    if (qq >= MT.BEST_Q && live.opts.onSnap) live.opts.onSnap(qq);
    var res = live.resolve, out = { q: qq, err: Math.round(err), word: w };
    if (live.e != null) out.e = live.e;
    detach();
    res(out);
  }
  function onDown(e) {
    e.preventDefault();
    var now = performance.now(), ts = e.timeStamp;
    stop(typeof ts === 'number' && ts > 0 && Math.abs(now - ts) < 500 ? ts : now);
  }
  function onKey(e) {
    if (!live || live.done) return;
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    if (e.repeat) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(performance.now()); }
  }
  function detach() {
    el.removeEventListener('pointerdown', onDown);
    document.removeEventListener('keydown', onKey, true);
  }
  function cancel() {
    if (!live) return;
    cancelAnimationFrame(live.raf);
    clearTimeout(live.lockT);
    var res = live.resolve;
    detach();
    live = null;
    hide();
    res(null);
  }
  function hide() {
    el.hidden = true;
    el.classList.remove('is-done', 'is-best', 'is-good', 'is-edone');
    el.querySelectorAll('.rm-lock').forEach(function (x) { x.classList.remove('go'); });
    word.textContent = '';
    live = null;
  }
  function run(opts) {
    if (live) cancel();
    var eff = effortOn();
    el.classList.toggle('two', eff);
    effRow.hidden = !eff;
    el.classList.remove('is-done', 'is-best', 'is-good', 'is-edone');
    word.textContent = '';
    verb.textContent = opts.verb || 'release';
    call.textContent = opts.label || '';
    el.hidden = false;
    /* the fill's colours run the whole track, so the zone it reaches has its own colour */
    if (eff) el.style.setProperty('--tw', Math.max(0, q('.rm-etrack').clientWidth - 6) + 'px');
    return new Promise(function (resolve) {
      live = { t0: performance.now(), opts: opts, resolve: resolve, done: false, raf: 0, e: null, stage: eff ? 'effort' : 'acc' };
      if (eff) { placeEffort(0); placeBands(MT.EFFORT_MID != null ? MT.EFFORT_MID : 0.5); placeNeedle(0); setStage('effort'); }
      else { placeBands(null); placeNeedle(0); setStage('acc'); }
      el.addEventListener('pointerdown', onDown);
      document.addEventListener('keydown', onKey, true);
      try { el.focus({ preventScroll: true }); } catch (x) {}
      live.raf = requestAnimationFrame(tick);
    });
  }
  return { el: el, run: run, cancel: cancel, hide: hide,
    running: function () { return !!(live && !live.done); },
    stage: function () { return live && !live.done ? (live.stage === 'lock' ? 'acc' : live.stage) : null; } };
}

window.STD_METER_UI = { create: create, effortOn: effortOn, bandsOf: bandsOf };
})();
