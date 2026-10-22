/* Shut The Door: the release meter (the owner's call, 2026-10-22).
 *
 * window.STD_METER in the browser (after contract.js), require('./meter.js')
 * in node for the numbers. A pitch is a type, a cell and a release: after the
 * throw button, a needle sweeps a bar and the tap that stops it is the
 * release. How close the tap is to the mark gives q (0..1), which the engine
 * turns into the spread of the miss (contract.js RELEASE, spreadOf). The meter
 * never grades: the grade is the call. It shows one quiet word after the tap.
 *
 * THE NUMBERS
 *   SWEEP_MS   one pass of the needle across the bar. It runs back and forth
 *              until the tap, so nobody is rushed.
 *   MARK       where the mark sits on the bar, 0..1 from the left.
 *   windowMs   how far off (ms) a tap may be before q reaches 0. It grows with
 *              the pitch's command, so control pitchers are easier to time:
 *              110 ms at command 50, 89 at 35, 151 at 80. Times the effort's
 *              windowScale(e) (EFFORT below): 1 without e.
 *   qOf        q = 1 - |error| / windowMs, at least 0, kept to two places
 *              (contract.js releaseQ).
 *   The bar shows two bands: the soft one where q >= 0.5 (tighter than his
 *   own command) and the bright one where q >= 0.8 (the best release).
 *
 * TUNED SO AN AVERAGE TAP IS HIS OWN COMMAND. A tap on a moving mark misses by
 * about 60 ms (one standard deviation) for an ordinary player on a phone, and
 * about one tap in ten is a real slip. Under that model (TIMING below, held by
 * test/engine.mjs) the mean spread is within a few percent of 1.0x at command
 * 50, the closer pool's. Stored calls carry q, so check-replays.mjs prints the
 * real players' mean spread: retune WINDOW_AT_50 from that, not from this model.
 */
(function () {
'use strict';
var NODE = typeof module !== 'undefined' && module.exports;
var C = NODE ? require('./contract.js') : window.STD_CONTRACT;

var SWEEP_MS = 850;
var MARK = 0.7;
var WINDOW_AT_50 = 110;
var TIMING = Object.freeze({ sdMs: 60, slip: 0.1, slipMaxMs: 450 });
var GOOD_Q = 0.5, BEST_Q = 0.8;

/* EFFORT, the first stop (the owner's call, 2026-10-22; CONTRACT.md 5c).
   e 0..1 (contract.js effortE): 0 his softest, 0.5 his ordinary pitch, 1 his
   hardest. A game rule on the meter: the accuracy window is scaled by
   windowScale(e), SOFT at e 0, 1 at e 0.5, HARD at e 1, straight between.
   So max effort shrinks both bands (the bright one too), and an easy pitch
   widens them. What e does to the pitch and the arm is grade.js EFFORT. An
   effort stop is only offered with the meter on (an e needs a q).
   EFFORT_SWEEP_MS is one pass of the effort needle, if the UI sweeps one:
   effortAt(t) is the e a stop at t ms gives (0 at the left, 1 at the right). */
var EFFORT_WINDOW = Object.freeze({ SOFT: 1.25, HARD: 0.6 });
var EFFORT_SWEEP_MS = 900;
function windowScale(e) {
  var ee = C.effortE(e);
  if (ee == null || ee === C.EFFORT.MID) return 1;
  return ee < C.EFFORT.MID ? 1 + (EFFORT_WINDOW.SOFT - 1) * (C.EFFORT.MID - ee) / C.EFFORT.MID
    : 1 - (1 - EFFORT_WINDOW.HARD) * (ee - C.EFFORT.MID) / (1 - C.EFFORT.MID);
}
function windowMs(command, e) {
  var c = Math.max(20, Math.min(80, typeof command === 'number' ? command : 50));
  return WINDOW_AT_50 * (1 + (c - 50) / 80) * windowScale(e);
}
function qOf(errMs, command, e) {
  return C.releaseQ(Math.max(0, 1 - Math.abs(errMs) / windowMs(command, e)));
}
function effortAt(t) {
  var ph = (t / EFFORT_SWEEP_MS) % 2;
  return C.effortE(ph < 1 ? ph : 2 - ph);
}
/* The speed and break a pitch shows at effort e: his own real pitches
   (contract.js stuffAt). velo in mph, pfx in inches, catcher's view. */
function stuffFor(arsenalPitch, e) { return C.stuffAt(arsenalPitch, e); }
function veloFor(arsenalPitch, e) { return C.stuffAt(arsenalPitch, e).velo; }
/* The names the two bar meter feature-detects (the UI agent's ask, 2026-10-22):
   EFFORT      true: effort exists. A call without e is the neutral effort, C.EFFORT.MID (0.5).
   windowOf(e, command)  the bright band (q >= BEST_Q) as [lo, hi], fractions of the bar from
               the left, at effort e and the pitch's command (50 when left out). The band's
               q is always BEST_Q..1; what effort moves is how wide it sits on the bar.
   veloOf(pitch, e)      the mph to show for that arsenal pitch at effort e (veloFor). */
function windowOf(e, command) {
  var half = (1 - BEST_Q) * windowMs(command == null ? 50 : command, e) / SWEEP_MS;
  return [Math.max(0, MARK - half), Math.min(1, MARK + half)];
}
/* The needle at t ms after the start: its place on the bar and its way. */
function needleAt(t) {
  var ph = (t / SWEEP_MS) % 2;
  return ph < 1 ? { pos: ph, dir: 1 } : { pos: 2 - ph, dir: -1 };
}
/* The signed error of a tap at t ms: negative is early (before the needle
   reaches the mark on its way), positive is late. */
function errAt(t) {
  var n = needleAt(t);
  return n.dir * (n.pos - MARK) * SWEEP_MS;
}
/* The quiet word after the tap. Execution only, never the call. */
function wordOf(q, err) {
  if (q >= 0.9) return 'perfect release';
  if (q >= 0.75) return 'sharp';
  if (q >= GOOD_Q) return 'on time';
  var side = err < 0 ? 'early' : 'late';
  return q >= 0.2 ? 'a bit ' + side : side;
}
/* The two bands as halves of the bar, from the window. */
function bandsFor(command, e) {
  var w = windowMs(command, e);
  return { good: (1 - GOOD_Q) * w / SWEEP_MS, best: (1 - BEST_Q) * w / SWEEP_MS };
}

/* ---- the meter on the page ---------------------------------------------------------- */

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* create(el): the meter in its slot. run({command, effort, verb, label, hint, practice, onSnap}) shows it, sweeps,
   and resolves {q, err, word} on the tap, or null when cancelled. hide() puts it away. */
function create(el) {
  el.classList.add('relm');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '-1');
  el.setAttribute('aria-label', 'Release. Tap when the needle hits the mark.');
  el.innerHTML =
    '<div class="rm-top"><b class="rm-what"></b><span class="rm-word" aria-live="polite"></span></div>' +
    '<div class="rm-bar"><i class="rm-good"></i><i class="rm-best"></i><i class="rm-mark"></i><i class="rm-needle"></i></div>';
  var needle = el.querySelector('.rm-needle');
  var good = el.querySelector('.rm-good'), best = el.querySelector('.rm-best'), mark = el.querySelector('.rm-mark');
  var word = el.querySelector('.rm-word'), what = el.querySelector('.rm-what');
  var live = null;

  function place(n) { needle.style.left = (n.pos * 100).toFixed(2) + '%'; }
  function tick(now) {
    if (!live) return;
    place(needleAt(Math.max(0, now - live.t0)));
    live.raf = requestAnimationFrame(tick);
  }
  function release(ts) {
    if (!live || live.done) return;
    var t = (ts || performance.now()) - live.t0;
    if (t < 120) return;                       // the tap that started it, or a bounce
    live.done = true;
    cancelAnimationFrame(live.raf);
    place(needleAt(t));
    var err = errAt(t), q = qOf(err, live.opts.command, live.opts.effort), w = wordOf(q, err);
    el.classList.add('done');
    el.classList.toggle('best', q >= BEST_Q);
    el.classList.toggle('good', q >= GOOD_Q && q < BEST_Q);
    var extra = live.opts.practice ? ' · miss ' + C.spreadOf(q, live.opts.repeat).toFixed(2) + 'x' : '';
    word.textContent = w + extra;
    if (q >= BEST_Q && live.opts.onSnap) live.opts.onSnap(q);
    var res = live.resolve;
    detach();
    res({ q: q, err: Math.round(err), word: w });
  }
  /* the tap's own time when the browser gives it on the same clock, so a slow frame never moves the release */
  function onDown(e) {
    e.preventDefault();
    var now = performance.now(), ts = e.timeStamp;
    release(typeof ts === 'number' && ts > 0 && Math.abs(now - ts) < 500 ? ts : now);
  }
  function onKey(e) {
    if (!live || live.done) return;
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    if (e.repeat) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(performance.now()); }
  }
  function detach() {
    el.removeEventListener('pointerdown', onDown);
    document.removeEventListener('keydown', onKey, true);
  }
  function cancel() {
    if (!live) return;
    cancelAnimationFrame(live.raf);
    var res = live.resolve;
    detach();
    live = null;
    hide();
    res(null);
  }
  function hide() { el.hidden = true; el.classList.remove('done', 'best', 'good'); live = null; }
  function run(opts) {
    if (live) cancel();
    var b = bandsFor(opts.command, opts.effort);
    mark.style.left = (MARK * 100) + '%';
    good.style.left = ((MARK - b.good) * 100).toFixed(2) + '%'; good.style.width = (2 * b.good * 100).toFixed(2) + '%';
    best.style.left = ((MARK - b.best) * 100).toFixed(2) + '%'; best.style.width = (2 * b.best * 100).toFixed(2) + '%';
    what.innerHTML = '<b>' + esc(opts.verb || 'release') + '</b>' + (opts.label ? ' ' + esc(opts.label) : '');
    word.textContent = opts.hint || 'tap on the mark';
    el.classList.remove('done', 'best', 'good');
    el.hidden = false;
    return new Promise(function (resolve) {
      live = { t0: performance.now(), opts: opts, resolve: resolve, done: false, raf: 0 };
      place({ pos: 0 });
      el.addEventListener('pointerdown', onDown);
      document.addEventListener('keydown', onKey, true);
      try { el.focus({ preventScroll: true }); } catch (e) {}
      live.raf = requestAnimationFrame(tick);
    });
  }
  return { el: el, run: run, cancel: cancel, hide: hide, running: function () { return !!(live && !live.done); } };
}

var api = { SWEEP_MS: SWEEP_MS, MARK: MARK, WINDOW_AT_50: WINDOW_AT_50, TIMING: TIMING, GOOD_Q: GOOD_Q, BEST_Q: BEST_Q,
  EFFORT: true, windowOf: windowOf, veloOf: veloFor,
  EFFORT_WINDOW: EFFORT_WINDOW, EFFORT_SWEEP_MS: EFFORT_SWEEP_MS, windowScale: windowScale, effortAt: effortAt,
  stuffFor: stuffFor, veloFor: veloFor, windowMs: windowMs, qOf: qOf, needleAt: needleAt, errAt: errAt, wordOf: wordOf, bandsFor: bandsFor, create: create };
if (NODE) module.exports = api;
if (typeof window !== 'undefined') window.STD_METER = api;
})();
