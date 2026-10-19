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

function supported() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

window.STD_STAGE = {
  supported,
  marks: {},
  current: null,
  load() { return (mod ||= import('./stage.js?v=21')); },
  create(canvas) {
    return this.load().then((m) => {
      if (!this.current || this.current.canvas !== canvas) this.current = m.create(canvas);
      return this.current;
    });
  },
};
window.dispatchEvent(new Event('std-stage'));
