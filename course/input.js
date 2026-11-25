/* Run The Course: one thumb.
 *
 * Drag anywhere for a floating joystick. Tap to travel there. WASD or the
 * arrow keys on a desktop. Only the first finger counts: no pinch, no second
 * touch. Every input becomes a command for the sim, and only when it changes
 * (the stick is 16 headings), so a shift's command log stays small. */
export function createInput(el, stick, { onDir, onTap, onLeave }) {
  let id = null, ox = 0, oy = 0, moved = false, t0 = 0, heading = -1;
  const keys = new Set();
  const DEAD = 12;
  function setDir(h) { if (h !== heading) { heading = h; onDir(h); } }
  function fromVec(dx, dy) { return ((Math.round(Math.atan2(-dy, dx) / (Math.PI / 8)) % 16) + 16) % 16; }
  el.addEventListener('pointerdown', e => {
    if (id !== null) return;
    id = e.pointerId; ox = e.clientX; oy = e.clientY; moved = false; t0 = e.timeStamp;
    try { el.setPointerCapture(id); } catch (err) {}
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - ox, dy = e.clientY - oy, d = Math.hypot(dx, dy);
    if (!moved && d < DEAD) return;
    moved = true;
    const k = Math.min(1, 44 / d);
    stick.style.display = 'block';
    stick.style.transform = 'translate(' + (ox - 56) + 'px,' + (oy - 56) + 'px)';
    stick.firstElementChild.style.transform = 'translate(' + dx * k + 'px,' + dy * k + 'px)';
    setDir(fromVec(dx, dy));
  });
  function up(e) {
    if (e.pointerId !== id) return;
    id = null; stick.style.display = 'none';
    if (moved) setDir(-1);
    else if (e.type === 'pointerup' && e.timeStamp - t0 < 600) onTap(e.clientX, e.clientY);
  }
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', e => e.preventDefault());
  const MAP = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  function keyDir() {
    let x = 0, y = 0;
    for (const k of keys) { x += MAP[k][0]; y += MAP[k][1]; }
    setDir(x || y ? fromVec(x, y) : -1);
  }
  addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'KeyE') { onLeave(); e.preventDefault(); return; }
    if (!MAP[e.code] || e.repeat) return;
    keys.add(e.code); keyDir(); e.preventDefault();
  });
  addEventListener('keyup', e => { if (keys.delete(e.code)) keyDir(); });
  addEventListener('blur', () => { keys.clear(); if (id === null) setDir(-1); });
  return { release() { keys.clear(); id = null; stick.style.display = 'none'; setDir(-1); } };
}
