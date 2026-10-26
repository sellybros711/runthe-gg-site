/* Shut The Door: the release meter on the page keeps the same numbers (the owner, 2026-10-26: "the
 * meter is laggy"). node shut-the-door/test/meter.mjs
 *
 * meter-ui.js was rebuilt to sweep by transform with the mound held still. This drives that file in
 * a small fake page with a fake clock and holds three things:
 *   1. the windows are the ones the game plays (BEST_Q 0.85, GOOD_Q 0.5, the sweeps, the mark, the
 *      window at command 50, the effort scale)
 *   2. a stop at a given time gives exactly the e and q meter.js says for that time (effortAt,
 *      qOf(errAt)), and the golden table below, recorded from the meter before the rebuild
 *   3. dropped frames move nothing: the same stop times with frames every 16 ms, every 100 ms, or
 *      none at all give the same e and q, and every frame drawn puts the needle where the clock says
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

/* a fake page: enough of the DOM for meter-ui.js, a clock we move, frames we fire by hand */
function page() {
  let now = 0, rafs = [], timers = [];
  const els = {};
  function fake(sel) {
    const e = {
      sel, style: { setProperty() {} }, dataset: {}, hidden: false, clientWidth: 300, offsetWidth: 300, listeners: {},
      classList: { s: new Set(), add(...a) { a.forEach((x) => this.s.add(x)); }, remove(...a) { a.forEach((x) => this.s.delete(x)); }, toggle(x, on) { on ? this.s.add(x) : this.s.delete(x); }, contains(x) { return this.s.has(x); } },
      setAttribute() {}, focus() {},
      addEventListener(t, f) { this.listeners[t] = f; }, removeEventListener(t) { delete this.listeners[t]; },
      querySelector(s) { return els[s] || (els[s] = fake(s)); },
      querySelectorAll() { return []; },
      set innerHTML(v) {}, set textContent(v) { this._t = v; }, get textContent() { return this._t || ''; },
    };
    return e;
  }
  const win = {
    performance: { now: () => now },
    requestAnimationFrame: (f) => { rafs.push(f); return rafs.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (f, ms) => { timers.push({ at: now + ms, f }); return timers.length; },
    clearTimeout: () => {},
    document: { addEventListener() {}, removeEventListener() {} },
    STD_CONTRACT: C, STD_METER: MT, Math, String, Promise,
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'meter-ui.js'), 'utf8'), win);
  const el = fake('#m-meter');
  const m = win.STD_METER_UI.create(el);
  return {
    m, el, els,
    /* move the clock to t, firing a frame every step ms on the way (0: none) and any timer due */
    to(t, step) {
      while (now < t) {
        now = Math.min(t, step ? now + step : t);
        timers = timers.filter((x) => (x.at <= now ? (x.f(), false) : true));
        if (step) { const f = rafs; rafs = []; f.forEach((g) => g(now)); }
      }
    },
    tap() { el.listeners.pointerdown({ preventDefault() {}, timeStamp: now }); },
    now: () => now,
  };
}

/* one pitch: stop power at te ms after the start, accuracy at ta ms after its needle starts */
async function pitch(te, ta, step, command, frames) {
  const p = page();
  const done = p.m.run({ command, verb: 'release', label: 'x' });
  p.to(te, step); p.tap();
  const accAt = p.now() + 260;                 // meter-ui LOCK_MS, then the needle starts on the clock
  p.to(accAt, step || 1);
  if (frames) {
    /* every frame drawn puts the needle where the clock says */
    const n = p.els['.rm-needle'];
    for (let k = 0; k < 40; k++) {
      p.to(p.now() + 16.7, 16.7);
      const want = MT.needleAt(p.now() - accAt).pos;
      const got = parseFloat(/translate3d\(([-\d.]+)%/.exec(n.style.transform)[1]) / 100;
      if (Math.abs(got - want) > 1e-4) return { bad: 'needle at ' + got + ', clock says ' + want };
    }
  }
  p.to(accAt + ta, step); p.tap();
  return done;
}

/* 2. the stops against meter.js and the golden table (recorded before the rebuild, 2026-10-26) */
const GOLD = [
  [450, 595, 50, 0.5, 1], [450, 600, 50, 0.5, 0.95], [130, 640, 35, 0.14, 0.57], [880, 2280, 80, 0.98, 0.84],
  [1350, 560, 50, 0.5, 0.68], [300, 1130, 65, 0.33, 0.82], [700, 3990, 50, 0.78, 0.94], [1700, 1080, 50, 0.11, 0.81],
];
for (const [te, ta, cmd, e, q] of GOLD) {
  const want = { e: MT.effortAt(te), q: MT.qOf(MT.errAt(ta), cmd, MT.effortAt(te)) };
  ok(want.e === e && want.q === q, `meter.js at ${te}/${ta} ms gives e ${want.e} q ${want.q}, the table says e ${e} q ${q}`);
  for (const step of [16.7, 100, 0]) {
    const r = await pitch(te, ta, step, cmd, false);
    ok(r && r.e === e && r.q === q, `a stop at ${te}/${ta} ms with a frame every ${step || 'never'} ms gives e ${r && r.e} q ${r && r.q} (e ${e} q ${q})`);
  }
}
/* 3. the needle on every frame is the clock's */
const fr = await pitch(400, 700, 16.7, 50, true);
ok(fr && !fr.bad, 'every frame puts the needle where the clock says' + (fr && fr.bad ? ': ' + fr.bad : ''));

console.log(`${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
