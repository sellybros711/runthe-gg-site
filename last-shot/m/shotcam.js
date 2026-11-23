/* THE RUN VIEW, PHASE 2: THE HYBRID (2026-11-22). The owner's "start phase 2,
 * the 3D shot cam". The tactics board (court2d.js) draws the play; at the
 * release a slanted wipe with a SHOT CAM tag cuts to a 3D camera on a canvas
 * of its own (shotcam3d.js): over the shooter's shoulder, a push in on the
 * rim as the ball flies, the make or the miss, and on a winner a pull back
 * wide. The answer cutaway and anything after the span go back to the board.
 * run-view.js registers it; client.js does not know it is there.
 *
 * WHEN THE 3D RUNS (gate(), asked once a page)
 *   - WebGL2, on a real GPU (a software renderer is a weak device)
 *   - navigator.deviceMemory at least 4 GB where the browser says, and
 *     navigator.hardwareConcurrency at least 4
 *   - never with prefers-reduced-motion (checked again every run)
 * Anything else: the board for the whole run, with no errors.
 *
 * WHEN IT LOADS. three.js is Shut The Door's vendored copy, by URL (THREE),
 * never part of this game's bundle; the browser keeps it a year. warm() waits
 * till the stage is on screen (the clipboard), then, in idle time while the
 * coach draws: the download, the scene built a piece at a time, every shader
 * compiled, one picture drawn. Not ready by the release: the board keeps that
 * run. Never on the tap's critical path.
 *
 * THE WATCHDOG. Over the first half second after the cut, the frame rate is
 * measured; under FPS_MIN, the run drops back to the board at once (and the
 * page stops trying the 3D after two such runs). A lost WebGL context or a
 * throw does the same.
 *
 * window.__shotCam (read only) says what happened, for the checks: state,
 * why, runs shown, dropped, the last cut's measured fps. A check may set
 * window.__shotCamOpts = { software: true } before the page loads, to let a
 * software renderer (headless Chromium's SwiftShader) through the gate. */
import { createCourt2d, warm as warm2d, planRun } from './court2d.js?b=04a290ad7e';

export const THREE = '/shut-the-door/3d/vendor/three-0.170.0/three.module.min.js';
const FPS_MIN = 40, WATCH = 0.5, WIPE = 0.38, TAG = 1.6, MAX_DPR = 2;

const OPTS = () => (typeof window !== 'undefined' && window.__shotCamOpts) || {};
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const idle = (fn, timeout = 1200) => typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 60);
const breathe = () => new Promise(r => idle(r, 400));

/* What the checks read. */
const STATUS = { state: 'idle', why: null, shown: 0, dropped: 0, fps: null, cutMs: null, on: false, sk: null, after: null, cam: null, chip: null, span: false };
if (typeof window !== 'undefined') Object.defineProperty(window, '__shotCam', { get: () => Object.assign({}, STATUS), configurable: true });

/* ---------- the gate ---------- */
let GATE = null;
export function gate() {
  if (GATE) return GATE;
  const no = why => (GATE = { ok: false, why });
  if (typeof window === 'undefined' || typeof document === 'undefined') return no('no-dom');
  const n = navigator, o = OPTS();
  if (o.off) return no('off');
  if (n.deviceMemory != null && n.deviceMemory < 4) return no('memory');
  if (n.hardwareConcurrency != null && n.hardwareConcurrency < 4) return no('cores');
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2');
    if (!gl) return no('no-webgl2');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) && !o.software) return no('software');
  } catch (e) { return no('no-webgl2'); }
  return (GATE = { ok: true, why: null });
}

/* ---------- the loader (one scene a page) ---------- */
let HOST = null;      // the hybrid that owns the 3D canvas
let SCENE = null, LOADING = null, WARM_ASKED = false;
function stageSize(cv) {
  const r = (cv.parentElement || cv).getBoundingClientRect();
  return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)), dpr: Math.min(MAX_DPR, window.devicePixelRatio || 1) };
}
function load() {
  if (LOADING || !HOST) return LOADING;
  const g = gate();
  if (!g.ok) { STATUS.state = 'off'; STATUS.why = g.why; return null; }
  if (reduced()) { STATUS.state = 'off'; STATUS.why = 'reduced-motion'; return null; }
  STATUS.state = 'loading';
  const host = HOST;
  LOADING = (async () => {
    const [T, M] = await Promise.all([import(THREE), import('./shotcam3d.js?b=04a290ad7e')]);
    await breathe();
    const sc = M.createScene(T, host.c3);
    host.c3.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('context-lost'); });
    const s = stageSize(host.cv);
    await sc.warm(s.w, s.h, s.dpr, breathe);
    SCENE = sc; STATUS.state = 'ready';
    host.onReady();
  })().catch(e => { fail('load: ' + (e && e.message || e)); });
  return LOADING;
}
function fail(why) {
  STATUS.state = 'failed'; STATUS.why = why; SCENE = null;
  if (HOST) HOST.hide3d();
}

/* Start the download once the stage is on screen (the clipboard), never
   before: the home screen pays nothing. */
function arm() {
  if (!HOST || !WARM_ASKED || LOADING) return;
  const go = () => idle(() => load(), 1500);
  const el = HOST.cv.parentElement;
  if (typeof IntersectionObserver === 'function' && el) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } });
    io.observe(el);
  } else go();
}
export function warm() {
  warm2d();
  if (WARM_ASKED) return;
  WARM_ASKED = true;
  arm();
}

/* ---------- the hybrid ---------- */
export function createShotCam(cv, inShotSpan) {
  const board = createCourt2d(cv);
  const c3 = document.createElement('canvas');
  c3.className = 'surface shot3d'; c3.hidden = true; c3.setAttribute('aria-hidden', 'true');
  cv.after(c3);
  const tag = document.createElement('div');
  tag.className = 'shotcam'; tag.textContent = 'SHOT CAM'; tag.hidden = true; tag.setAttribute('aria-hidden', 'true');
  c3.after(tag);
  let R = null;          // this run: { src, plan, use, cut, frames, t0, dropped }
  let showing = false;

  const self = {
    cv, c3,
    hide3d() { STATUS.on = false; if (!showing && c3.hidden) return; showing = false; c3.hidden = true; tag.hidden = true; c3.style.clipPath = ''; },
    onReady() { if (R && R.src && !R.plan) R.plan = planRun(R.src); }
  };
  HOST = self;
  if (WARM_ASKED) arm();
  // the court put away (back to the clipboard): the 3D goes with it
  if (typeof MutationObserver === 'function') new MutationObserver(() => { if (cv.hidden) self.hide3d(); }).observe(cv, { attributes: true, attributeFilter: ['hidden'] });

  function camStart(frames, run) {
    board.camStart(frames, run);
    self.hide3d();
    STATUS.sk = null; STATUS.after = null; STATUS.span = false; STATUS.chip = null;
    R = { src: run || null, plan: null, use: null, cut: null, n: 0, t0: 0, prev: 0, dropped: false };
    // the 3D's read of the run, in idle time (the board did its own in camStart)
    const mine = R;
    if (run && SCENE) idle(() => { if (R === mine && !mine.plan) mine.plan = planRun(run); }, 800);
  }

  /* At the release: 3D for this run, or the board. */
  function decide() {
    if (!SCENE || !R.src || reduced() || STATUS.dropped >= 2) return false;
    try { if (!R.plan) R.plan = planRun(R.src); SCENE.setRun(R.plan); } catch (e) { fail('plan: ' + e.message); return false; }
    return !!(R.plan && R.plan.shot);
  }

  function drop(why) {
    R.dropped = true; STATUS.dropped++; STATUS.why = why;
    self.hide3d();
  }

  function draw(fr, opts = {}) {
    const span = R && fr && !opts.hold && inShotSpan(fr, opts);
    STATUS.span = !!span;
    if (!span) { self.hide3d(); return board.draw(fr, opts); }
    if (R.use == null) R.use = decide();
    if (!R.use || R.dropped || !SCENE) { self.hide3d(); return board.draw(fr, opts); }
    const now = performance.now();
    const first = R.cut == null;
    if (first) { R.cut = now; R.prev = now; STATUS.shown++; STATUS.fps = null; }
    const dt = Math.min(0.1, (now - R.prev) / 1000); R.prev = now;
    const since = (now - R.cut) / 1000;
    // the wipe: the board under it till the 3D has the whole stage
    const u = Math.min(1, since / WIPE), e = 1 - Math.pow(1 - u, 3);
    if (u < 1) board.draw(fr, opts);
    const s = stageSize(cv);
    try {
      SCENE.resize(s.w, s.h, s.dpr);
      SCENE.draw(fr, opts, dt, first);
    } catch (err) { fail('draw: ' + (err && err.message)); return board.draw(fr, opts); }
    if (!showing) { showing = true; c3.hidden = false; }
    STATUS.on = true; STATUS.sk = fr.sk; STATUS.after = opts.after ? opts.after.t : null; STATUS.cam = SCENE.camMode(); STATUS.chip = SCENE.chipBox();
    const x = (1 - e) * 130 - 15;
    c3.style.clipPath = u >= 1 ? '' : 'polygon(' + x + '% 0,100% 0,100% 100%,' + (x - 15) + '% 100%)';
    tag.hidden = since > TAG;
    if (first) STATUS.cutMs = performance.now() - now;
    // the watchdog: the frame rate over the first half second (the cut's own frame not counted)
    if (!first && !R.watched) {
      R.n++;
      if (R.n === 1) R.t0 = now;
      const span = (now - R.t0) / 1000;
      if (span >= WATCH || (R.n >= 4 && span > 0 && (R.n - 1) / span < 20)) {
        R.watched = true; STATUS.fps = Math.round((R.n - 1) / Math.max(span, 1e-3));
        if (STATUS.fps < FPS_MIN && !OPTS().noWatch) { drop('slow ' + STATUS.fps + ' fps'); return board.draw(fr, opts); }
      }
    }
  }

  function drawAnswer(o) { self.hide3d(); board.drawAnswer(o); }

  /* a resize or a card coming up: the last picture again, in whichever view it was */
  function redraw() {
    if (showing && SCENE) { const s = stageSize(cv); SCENE.resize(s.w, s.h, s.dpr); SCENE.render(); board.redraw(); return; }
    board.redraw();
  }

  return { draw, drawAnswer, camStart, redraw, view: () => board.view() };
}
