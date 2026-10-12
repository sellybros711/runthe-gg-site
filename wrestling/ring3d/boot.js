/* Run The Ropes 3D: the door the career game comes in through.

   index.html is a classic script and cannot import a module, so this file
   loads the stage and hands it over as window.RTR_3D. Until it has arrived,
   and on any device that cannot draw WebGL, the game plays on its SVG ring
   exactly as it always has: nothing in the match engine waits for this file.

   A device that can draw it gets it by default. `rtr_ring3d` = '0' in local
   storage (Help has the switch) puts the classic ring back. */
import { Stage } from './stage.js?v=1';

function canGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
function wanted() {
  try { if (/[?&]ring2d\b/.test(location.search)) return false; return localStorage.getItem('rtr_ring3d') !== '0'; } catch (e) { return true; }
}
function quality() {
  /* a small or low core device draws without shadows and with a thinner crowd */
  const cores = navigator.hardwareConcurrency || 4, small = Math.min(screen.width, screen.height) < 500;
  return cores <= 4 && small ? 'low' : 'high';
}
const ok = canGL();
window.RTR_3D = {
  ok,
  on() { return ok && wanted(); },
  set(on) { try { localStorage.setItem('rtr_ring3d', on ? '1' : '0'); } catch (e) {} },
  make(host, opts) { return new Stage(host, Object.assign({ quality: quality() }, opts || {})); },
};
window.dispatchEvent(new Event('rtr3d'));
