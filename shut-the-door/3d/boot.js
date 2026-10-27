/* Shut The Door: the door to the 3D mound. window.STD_STAGE, for the game (ui.js).
 *
 * Small on purpose: the page runs it at once and the home screen pays nothing for the 3D. three.js,
 * the people and the park come in through stage.js, imported only when the page asks for the
 * stage (ui.js does that from the home screen, once the spot is on screen).
 *   STD_STAGE.supported()        WebGL here? (no: the game keeps its old drawing)
 *   STD_STAGE.create(canvas)     a promise of the stage (stage.js has its calls); starts every download
 *   STD_STAGE.current            the stage, once made
 *   STD_STAGE.marks              when things happened, for check-load (ms since the page started)
 */
let mod = null;

/* Asked once, then remembered, and the probe's context let go at once: every call used to open a new
   WebGL context and keep it, and a browser holds only so many (Chromium about 16) before it takes the
   oldest away, which can be the mound's own. A page that asked again and again (a poll, or the
   browser check's wait for the warm, every frame) lost the mound's context mid compile. */
let ok = null;
function supported() {
  if (ok != null) return ok;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    ok = !!(window.WebGLRenderingContext && gl);
    const lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  } catch (e) { ok = false; }
  return ok;
}

window.STD_STAGE = {
  supported,
  marks: {},
  current: null,
  load() { return (mod ||= import('./stage.js?v=68')); },
  create(canvas) {
    return this.load().then((m) => {
      if (!this.current || this.current.canvas !== canvas) this.current = m.create(canvas);
      return this.current;
    });
  },
};
window.dispatchEvent(new Event('std-stage'));
