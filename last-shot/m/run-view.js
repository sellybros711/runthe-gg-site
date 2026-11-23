/* THE RUN VIEW: which renderer draws a play on the court, and the one
 * thing every renderer shares (the frame between two sim frames).
 *
 * A renderer is createX(canvas) returning
 *   draw(fr, opts)      one frame. opts: cam, focus, after, spin, hold, debug
 *   drawAnswer(o)       the answer cutaway: { kind, seed, k, after }
 *   camStart(frames, run)  a new run: every frame it will show, and { res, play }
 *   redraw()            the last picture again (a resize, a card coming up)
 *   view()              the camera, { s, ox, oy } in CSS px (check-browser reads it)
 * and warm() builds what it can before the first Run It.
 *
 * THE SWITCH. RUN_VIEW names the renderer; client.js asks for nothing else.
 *   board    Phase 1 (2026-11-19): the tactics board (court2d.js), the whole run.
 *   hybrid   Phase 2 (2026-11-22), the one in play: the board for the play,
 *            then the release to finish span (inShotSpan: the frames with the
 *            ball up, fr.sk set, and the after-ball, opts.after) on the 3D shot
 *            cam (shotcam.js, its scene shotcam3d.js, its players figures3d.js)
 *            on a canvas of its own. A device that fails its gate, reduced
 *            motion, a slow first half second or a scene not loaded by the
 *            release all keep the board for the run.
 * client.js, the timing, the captions and the card do not change. */
import { createCourt2d, warm as warm2d } from './court2d.js?b=e8adaf5f5c';
import { createShotCam, warm as warmShotCam } from './shotcam.js?b=e8adaf5f5c';

const RENDERERS = {
  board: { create: createCourt2d, warm: warm2d },
  hybrid: { create: cv => createShotCam(cv, inShotSpan), warm: warmShotCam }
};
export const RUN_VIEW = 'hybrid';

export function createRunView(cv, kind = RUN_VIEW) { return (RENDERERS[kind] || RENDERERS.board).create(cv); }
export function warm(kind = RUN_VIEW) { const r = RENDERERS[kind] || RENDERERS.board; if (r.warm) r.warm(); }

/* The span a shot cam would own: the ball in the air, then playing out. */
export const inShotSpan = (fr, opts) => !!fr && (fr.sk != null || !!(opts && opts.after));

/* ---------- between two frames ---------- */
const lerp = (a, b, u) => a + (b - a) * u;
function lerpAng(a, b, u) { const d = ((b - a + 540) % 360) - 180; return (a + d * u + 360) % 360; }
function lerpWrap(a, b, u) { let d = b - a; if (d < -50) d += 100; if (d > 50) d -= 100; return (a + d * u + 100) % 100; }

/* The sim records 30 frames a second; the screen runs at 60 or more. This is
   the frame between a and b, u of the way (0 to 1). */
export function between(a, b, u) {
  if (!b || u <= 0) return a;
  if (u >= 1) return b;
  const arr = (p, q, fn = lerp) => p && q && p.length === q.length ? p.map((v, i) => fn(v, q[i], u)) : p;
  // a catch or a release is a hand off, not a slide: the ball snaps with its frame
  const ballJump = a.h !== b.h && a.h && b.h;
  return Object.assign({}, a, {
    t: lerp(a.t, b.t, u), o: arr(a.o, b.o), x: arr(a.x, b.x), b: ballJump ? (u < 0.5 ? a.b : b.b) : arr(a.b, b.b),
    f: arr(a.f, b.f, lerpAng), g: arr(a.g, b.g, lerpWrap),
    sk: a.sk != null && b.sk != null ? lerp(a.sk, b.sk, u) : a.sk,
    k: u < 0.5 ? a.k : b.k, h: u < 0.5 ? a.h : b.h, s: u < 0.5 ? a.s : b.s
  });
}
