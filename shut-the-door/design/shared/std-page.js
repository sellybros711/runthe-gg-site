/* Shut The Door design mockups: the page runner. MOCKUP CODE, never loaded by the game.

   One HTML page per direction holds every screen as a <section data-s="...">. ?s=<screen> shows
   one; with no ?s the page shows the screen index. Each screen's render hooks run once its
   section is visible and the fonts are in, then window.__done is set (the screenshot script
   waits on it). One global, STD_PAGE. */
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const hooks = {};
  function on(screen, fn) { hooks[screen] = fn; }
  function coach(host, look, o) {
    o = o || {};
    const T = window.STD3D, SC = window.STD_SCENE, F = window.STD_FIG;
    const w = o.w || host.clientWidth, h = o.h || host.clientHeight;
    const kind = o.kind || 'coach', fig = F.build(kind, SC.KITS[kind], { pos: [0, 0, 0], fwd: [0, 1] }, o.pose || kind);
    const cam = T.camera(o.eye || [1.8, 11, 5.3], o.look || [0, 0, 5.0], o.frame || 3.3, w, h);
    const c = document.createElement('canvas'); c.className = 'r3d'; host.appendChild(c);
    SC.renderView(c, { w, h, look, res: o.res || 1, figures: [fig], cam, transparent: true });
  }
  async function start() {
    const s = q.get('s');
    document.documentElement.dataset.screen = s || 'index';
    document.querySelectorAll('section[data-s]').forEach((el) => { el.hidden = !!s && el.dataset.s !== s; if (!s) el.hidden = el.dataset.s !== 'index'; });
    try { await document.fonts.ready; } catch (e) { /* fonts fail soft */ }
    await new Promise((r) => requestAnimationFrame(() => r()));
    try { if (s && hooks[s]) await hooks[s](document.querySelector(`section[data-s="${s}"]`), q); }
    catch (e) { console.log('render error', e.message, e.stack); }
    window.__done = 1;
  }
  window.STD_PAGE = { on, start, coach, q };
})();
