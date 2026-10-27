/* Shut The Door: the combo meter keeps the numbers (the owner, 2026-10-26: power on a column beside the
 * zone, then a ring closing on the aim point; and before it, "the meter is laggy").
 * node shut-the-door/test/meter.mjs
 *
 * Holds meter.js (the one source of the numbers) and drives meter-ui.js in a small fake page with a
 * fake clock:
 *   1. the windows are the ones the game plays (BEST_Q 0.85, GOOD_Q 0.5, the sweeps, the mark, the
 *      window at command 50, the effort scale) and perfect is PERFECT_E 0.97 and PERFECT_Q 0.9
 *   2. the ring's law: one pass takes SWEEP_MS x windowScale(e), and a tap that misses the mark by m
 *      ms gives exactly the q the two bar meter gave for an m ms miss, at every power, so a stored
 *      call's q and e keep their meaning
 *   3. the ring is not there until power is set, then it closes on the clock
 *   4. a stop at a given time gives exactly meter.js's e and q (effortAt, qOf(ringErrAt)), and the
 *      golden table below (recorded 2026-10-26), with frames every 16 ms, every 100 ms or none:
 *      a dropped frame moves nothing
 *   5. every frame drawn puts the ring where the clock says
 *   6. perfect and perfect: perfectOf on both stops, and the page hears it once (onPerfect 2)
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = require(path.join(DIR, 'contract.js'));
const MT = require(path.join(DIR, 'meter.js'));

let passes = 0, fails = 0;
function ok(c, m) { if (c) passes++; else { fails++; console.log('FAIL ' + m); } }

/* 1. the windows */
ok(MT.BEST_Q === 0.85 && MT.GOOD_Q === 0.5, 'the bands are q 0.85 and 0.5');
ok(MT.SWEEP_MS === 850 && MT.EFFORT_SWEEP_MS === 900 && MT.MARK === 0.7 && MT.WINDOW_AT_50 === 110, 'the sweeps, the mark and the window');
ok(MT.EFFORT_WINDOW.SOFT === 1.25 && MT.EFFORT_WINDOW.HARD === 0.6, 'the effort scale');
ok(MT.PERFECT_E === 0.97 && MT.PERFECT_Q === 0.9, 'perfect power is e 0.97 and over, a perfect release q 0.9 and over');

/* 2. the ring's law */
ok(MT.ringMs(0) === 1062.5 && MT.ringMs(0.5) === 850 && MT.ringMs(1) === 510 && MT.ringMs(null) === 850, 'one pass of the ring: 1062.5 ms soft, 850 ordinary, 510 max');
for (const e of [0, 0.25, 0.5, 0.75, 1, null]) {
  const P = MT.ringMs(e), b = MT.ringBands(50, e);
  ok(Math.abs(b.best * P - (1 - MT.BEST_Q) * MT.windowMs(50, e)) < 1e-9, 'the bright band in ms is windowMs at e ' + e);
  for (const m of [-40, -16, -5, 0, 7, 16, 33, 60]) {
    const ring = MT.qOf(MT.ringErrAt(MT.MARK * P + m, e), 50, e);
    const bar = MT.qOf(MT.errAt(MT.MARK * MT.SWEEP_MS + m), 50, e);
    if (ring !== bar) ok(false, `a ${m} ms miss at e ${e}: the ring gives q ${ring}, the bar gave ${bar}`);
  }
}
ok(MT.ringBands(50, 0).best === MT.ringBands(50, 1).best, 'the bands sit at the same place on the ring at every power');

/* a fake page: enough of the DOM for meter-ui.js, a clock we move, frames we fire by hand */
function page() {
  let now = 0, rafs = [], timers = [];
  function fake(tag) {
    const kids = {};
    const e = {
      tag, style: {}, dataset: {}, hidden: false, clientWidth: 300, offsetWidth: 300, listeners: {},
      classList: { s: new Set(), add(...a) { a.forEach((x) => this.s.add(x)); }, remove(...a) { a.forEach((x) => this.s.delete(x)); }, toggle(x, on) { if (on === undefined) on = !this.s.has(x); on ? this.s.add(x) : this.s.delete(x); }, contains(x) { return this.s.has(x); } },
      setAttribute() {}, focus() {}, appendChild(c) { return c; }, closest() { return null; },
      addEventListener(t, f) { this.listeners[t] = f; }, removeEventListener(t) { delete this.listeners[t]; },
      querySelector(s) { return kids[s] || (kids[s] = fake(s)); },
      querySelectorAll() { return []; }, getAnimations() { return []; },
      set innerHTML(v) {}, set textContent(v) { this._t = v; }, get textContent() { return this._t || ''; },
    };
    return e;
  }
  const made = [];
  const win = {
    performance: { now: () => now },
    requestAnimationFrame: (f) => { rafs.push(f); return rafs.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (f, ms) => { timers.push({ at: now + ms, f }); return timers.length; },
    clearTimeout: () => {},
    matchMedia: () => ({ matches: false }), navigator: {}, innerWidth: 390, innerHeight: 844,
    document: { addEventListener() {}, removeEventListener() {}, body: fake('body'), createElement: (t) => { const x = fake(t); made.push(x); return x; } },
    STD_CONTRACT: C, STD_METER: MT, Math, String, Promise, isFinite,
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'meter-ui.js'), 'utf8'), win);
  const el = fake('#m-meter');
  const m = win.STD_METER_UI.create(el);
  return {
    m, el,
    to(t, step) {
      while (now < t) {
        now = Math.min(t, step ? now + step : t);
        timers = timers.filter((x) => (x.at <= now ? (x.f(), false) : true));
        if (step) { const f = rafs; rafs = []; f.forEach((g) => g(now)); }
      }
    },
    tap() { (el.listeners.pointerdown || (() => {}))({ preventDefault() {}, timeStamp: now }); },
    now: () => now,
  };
}

/* the ring's scale at pos, as meter-ui.js draws it at 390x844 */
const R0 = Math.max(110, Math.min(170, 390 * 0.4)), RT = 24, K = (R0 - RT) / MT.MARK;
const scaleAt = (pos) => Math.max(0.001, Math.max(0, RT + (MT.MARK - pos) * K) / R0);

/* one pitch: stop power at te ms after the start, the release at ta ms after the ring starts */
async function pitch(te, ta, step, command, check) {
  const p = page(), heard = [];
  const done = p.m.run({ command, verb: 'release', label: 'x', onPerfect: (l) => heard.push(l) });
  const ring = p.m.ring;
  const hiddenAtStart = ring.hidden;
  p.to(te, step); p.tap();
  const lockedAt = p.now();
  p.to(lockedAt + 100, step || 1);
  const hiddenInLock = ring.hidden;
  const accAt = lockedAt + 260;                // meter-ui LOCK_MS, then the ring starts on the clock
  p.to(accAt, step || 1);
  const shownAfter = !ring.hidden;
  let bad = null;
  if (check) {
    const mv = ring.querySelector('.rm-rmove');
    for (let k = 0; k < 40 && !bad; k++) {
      p.to(p.now() + 16.7, 16.7);
      const want = scaleAt(MT.ringAt(p.now() - accAt, MT.effortAt(te)).pos);
      const got = parseFloat(/scale\(([-\d.]+)\)/.exec(mv.style.transform)[1]);
      if (Math.abs(got - want) > 2e-4) bad = 'ring at scale ' + got + ', the clock says ' + want;
    }
  }
  p.to(accAt + ta, step); p.tap();
  const r = await done;
  return { r, heard, hiddenAtStart, hiddenInLock, shownAfter, bad };
}

/* 3, 4, 6. the stops against meter.js and the golden table: [power ms, ring ms, command, e, q] */
const GOLD = [
  [450, 595, 50, 0.5, 1], [450, 600, 50, 0.5, 0.95], [130, 560, 35, 0.14, 0], [880, 306, 80, 0.98, 0.35],
  [1350, 540, 50, 0.5, 0.5], [700, 2200, 50, 0.78, 0.73], [900, 357, 50, 1, 1], [880, 370, 80, 0.98, 0.96],
  [130, 700, 35, 0.14, 0.98], [1700, 1180, 50, 0.11, 0],
];
for (const [te, ta, cmd, e, q] of GOLD) {
  const want = { e: MT.effortAt(te), q: MT.qOf(MT.ringErrAt(ta, MT.effortAt(te)), cmd, MT.effortAt(te)) };
  ok(want.e === e && want.q === q, `meter.js at ${te}/${ta} ms gives e ${want.e} q ${want.q}, the table says e ${e} q ${q}`);
  const pf = MT.perfectOf(e, q);
  for (const step of [16.7, 100, 0]) {
    const o = await pitch(te, ta, step, cmd, false), r = o.r;
    ok(r && r.e === e && r.q === q, `a stop at ${te}/${ta} ms with a frame every ${step || 'never'} ms gives e ${r && r.e} q ${r && r.q} (e ${e} q ${q})`);
    ok(o.hiddenAtStart && o.hiddenInLock && o.shownAfter, `the ring waits for power (${te}/${ta}, frames ${step || 'never'})`);
    ok(r && r.perfect.both === pf.both && o.heard.join() === (pf.both ? '2' : pf.release ? '1' : ''), `perfect at ${te}/${ta}: ${JSON.stringify(r && r.perfect)}, heard ${o.heard.join()}`);
  }
}
/* 5. the ring on every frame is the clock's, at three powers */
for (const te of [130, 450, 900]) {
  const fr = await pitch(te, 700, 16.7, 50, true);
  ok(!fr.bad, 'every frame puts the ring where the clock says at e ' + MT.effortAt(te) + (fr.bad ? ': ' + fr.bad : ''));
}

/* QUICK DELIVERY (rules 7, a later PR): with meter.js QUICK the column greys above powerCap, the
   needle turns there and the ring is quicker; before it, quick changes nothing */
{
  const Q = MT.QUICK;
  const p = page();
  p.m.run({ command: 50, quick: true });
  const col = p.m.col, cap = col.querySelector('.rm-ccap');
  const want = Q ? ((1 - Q.E_MAX) * 100).toFixed(2) + '%' : '0.00%';
  ok(cap.style.height === want && col.classList.contains('is-capped') === !!Q, 'a quick delivery greys the column above meter.js QUICK (' + cap.style.height + ')');
  if (Q) {
    let top = 0; for (let t = 0; t < 4000; t += 3) top = Math.max(top, MT.powerAt(t, true));
    ok(top <= Q.E_MAX && top >= Q.E_MAX - 0.01, 'the power needle turns at QUICK.E_MAX (' + top + ')');
    ok(Math.abs(MT.ringMs(0.5, true) - 850 * Q.WINDOW) < 1e-9, 'the ring is QUICK.WINDOW quicker');
  } else {
    ok(MT.powerAt(450, true) === MT.effortAt(450) && MT.ringMs(0.5, true) === 850, 'without meter.js QUICK a quick delivery changes nothing');
  }
  const q = page();
  q.m.run({ command: 50 });
  ok(q.m.col.querySelector('.rm-ccap').style.height === '0.00%' && !q.m.col.classList.contains('is-capped'), 'no quick delivery, no grey');
}
console.log(`${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
