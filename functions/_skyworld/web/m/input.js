/* Input. Drag to pan, and it glides on when let go. Mouse wheel zooms at the pointer; a trackpad pans with two fingers
   and zooms with a pinch (Chrome sends that as a wheel with ctrlKey, Safari as a gesture). Two fingers on a phone pinch,
   and lifting one goes back to panning with the other. Double click zooms in. Arrows or WASD pan while held, plus and
   minus zoom, Escape closes the panel. Every input wakes the frame loop (world.js), which sleeps when nothing moves. */
(function(){
var S = window.SKY_W, cam = S.cam, DPR = S.DPR;

// the ground under a point of the screen: try each island's own height
function groundAt(sx, sy){ var p = S.toPic(sx, sy), A = S.R.A, det = A[1][0] * A[2][1] - A[2][0] * A[1][1], best = null;
  S.cur.list.forEach(function(g){ var px = p[0] - A[0][0] - A[3][0] * g.z, py = p[1] - A[0][1] - A[3][1] * g.z, x = (px * A[2][1] - A[2][0] * py) / det, y = (A[1][0] * py - px * A[1][1]) / det;
    if (S.shape(g, x, y) > 0 && (!best || g.y > best.g.y)) best = { g:g, x:x, y:y }; }); return best; }
// what is under a point of the screen. On the map: an island (its sign or its ground). In a world: a district, or the island.
// Signs are where world.js last drew them (sx, sy, sw on the island or district).
function hitAt(sx, sy){ var cur = S.cur, L = cur.list;
  for (var i = L.length - 1; i >= 0; i--){ var g = L[i]; if (!cur.world && g.sx != null && Math.abs(sx - g.sx) < g.sw / 2 && sy > g.sy && sy < g.sy + 22) return { g:g }; }
  if (cur.world) for (var j = 0; j < cur.w.dist.length; j++){ var d0 = cur.w.dist[j]; if (d0.sx != null && Math.abs(sx - d0.sx) < d0.sw / 2 && sy > d0.sy && sy < d0.sy + 22) return { g:cur.w, d:d0 }; }
  var hit = window.SKY_HIT && window.SKY_HIT(sx, sy); if (hit) return hit;   // the characters, from stage c
  var q = groundAt(sx, sy); if (!q) return null;
  if (!cur.world) return { g:q.g };
  var d = null, reach = 2.2 * (q.g.bs || 1); q.g.dist.forEach(function(k){ var e = Math.hypot(q.x - k.x, (q.y - k.y) * 1.2); if (e < reach && (!d || e < d.e)) d = { k:k, e:e }; });
  return d ? { g:q.g, d:d.k } : { g:q.g }; }
// the same thing under the pointer: kept as the same object, so the overlay is redrawn only when it changes
function same(a, b){ return a === b || (!!a && !!b && a.g === b.g && a.d === b.d && a.p === b.p); }

var KEYS = /^(Arrow(Left|Right|Up|Down)|Key[WASD])$/;
function input(){ var ov = S.ov, pts = {}, drag = null, pinch = null, trail = [];
  function startDrag(x, y, moved){ drag = { x:x, y:y, cx:cam.x, cy:cam.y, moved:moved }; cam.dragging = true; trail = [[performance.now(), cam.x, cam.y]]; }
  ov.addEventListener('pointerdown', function(e){ pts[e.pointerId] = [e.clientX, e.clientY]; try { ov.setPointerCapture(e.pointerId); } catch (er) {}
    cam.tx = cam.ty = null; cam.vx = cam.vy = 0; S.wake();
    var ids = Object.keys(pts); if (ids.length === 2){ var a = pts[ids[0]], b = pts[ids[1]]; pinch = { d:Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, k:cam.k, mx:(a[0] + b[0]) / 2, my:(a[1] + b[1]) / 2 }; cam.pinching = true; drag = null; return; }
    startDrag(e.clientX, e.clientY, 0); });
  ov.addEventListener('pointermove', function(e){ if (pts[e.pointerId]) pts[e.pointerId] = [e.clientX, e.clientY]; var ids = Object.keys(pts);
    if (pinch && ids.length === 2){ var a = pts[ids[0]], b = pts[ids[1]], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      cam.x -= (mx - pinch.mx) * DPR / cam.k; cam.y -= (my - pinch.my) * DPR / cam.k; pinch.mx = mx; pinch.my = my;
      S.zoomAt(pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, mx, my, true); return; }
    if (drag && pts[e.pointerId]){ var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.moved > 3){ ov.style.cursor = 'grabbing'; SKY_UI.hover(null); }
      cam.x = drag.cx - dx * DPR / cam.k; cam.y = drag.cy - dy * DPR / cam.k; S.repaint();
      var t = performance.now(); trail.push([t, cam.x, cam.y]); while (trail.length > 2 && t - trail[0][0] > 90) trail.shift(); return; }
    if (e.pointerType === 'mouse'){ var h = hitAt(e.clientX, e.clientY); if (!same(h, S.hov)){ S.hov = h; S.wake(); }
      S.restOn(h && h.g && !S.cur.world ? h.g : null);
      SKY_UI.hover(S.hov, e.clientX, e.clientY); ov.style.cursor = S.hov ? 'pointer' : 'grab'; } });
  function up(e){ delete pts[e.pointerId]; var left = Object.keys(pts);
    if (pinch && left.length < 2){ pinch = null; cam.pinching = false; cam.lastZoom = performance.now();
      // the finger still down pans on from where it is; lifting it is not a click
      if (left.length === 1){ var p = pts[left[0]]; startDrag(p[0], p[1], 99); } else { drag = null; cam.dragging = false; }
      S.wake(); return; }
    if (drag){ if (drag.moved < 6) S.select(hitAt(e.clientX, e.clientY));
      else { var t = performance.now(), f = trail[0], l = trail[trail.length - 1], dtt = (l[0] - f[0]) / 1000; if (dtt > 0.01 && t - l[0] < 60){ cam.vx = (l[1] - f[1]) / dtt; cam.vy = (l[2] - f[2]) / dtt; } } }
    drag = null; cam.dragging = false; ov.style.cursor = 'grab'; S.wake(); }
  ov.addEventListener('pointerup', up);
  ov.addEventListener('pointercancel', function(e){ delete pts[e.pointerId]; pinch = null; cam.pinching = false; drag = null; cam.dragging = false; S.wake(); });
  ov.addEventListener('pointerleave', function(){ if (!drag){ if (S.hov){ S.hov = null; S.wake(); } S.restOn(null); SKY_UI.hover(null); } });
  // a double click on an island has already gone into it (the first click did): it must not zoom the world that opens
  ov.addEventListener('dblclick', function(e){ if (S.moving() || performance.now() - S.enteredAt < 1000) return; S.zoomTo(cam.kt * 1.8, e.clientX, e.clientY); });
  ov.addEventListener('wheel', function(e){ e.preventDefault(); cam.tx = cam.ty = null; SKY_UI.hover(null);
    var px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? S.VH : 1, dx = e.deltaX * px, dy = e.deltaY * px;
    var mouse = e.deltaMode !== 0 || (e.wheelDeltaY && Math.abs(e.wheelDeltaY) % 120 === 0 && !e.deltaX);
    if (e.ctrlKey){ S.zoomAt(cam.kt * Math.exp(-dy * 0.012), e.clientX, e.clientY, true); return; }   // a trackpad pinch: follow the fingers exactly
    if (mouse){ S.zoomTo(cam.kt * Math.exp(-Math.sign(dy) * 0.28), e.clientX, e.clientY); return; }
    cam.x += dx * DPR / cam.k; cam.y += dy * DPR / cam.k; cam.vx = cam.vy = 0; S.repaint(); }, { passive:false });
  // Safari's trackpad pinch
  var g0 = null;
  ov.addEventListener('gesturestart', function(e){ e.preventDefault(); g0 = cam.kt; cam.pinching = true; });
  ov.addEventListener('gesturechange', function(e){ e.preventDefault(); if (g0 == null) return; S.zoomAt(g0 * e.scale, e.clientX, e.clientY, true); });
  ov.addEventListener('gestureend', function(e){ e.preventDefault(); g0 = null; cam.pinching = false; cam.lastZoom = performance.now(); S.wake(); });
  // by e.code, the key's place: e.key changes with Shift or Caps Lock between down and up, and the key would stay held
  addEventListener('keydown', function(e){ if (e.target && /input|textarea/i.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
    if (KEYS.test(e.code)){ cam.held[e.code] = true; e.preventDefault(); S.wake(); return; }
    if (e.key === '+' || e.key === '=') S.zoom(1); else if (e.key === '-' || e.key === '_') S.zoom(-1); else if (e.key === 'Escape'){ if (S.sel) S.select(null); else S.leave(); } });
  addEventListener('keyup', function(e){ delete cam.held[e.code]; });
  addEventListener('blur', function(){ cam.held = {}; });
  addEventListener('resize', function(){ S.fit(); S.zoomTo(cam.kt); }); }

S.groundAt = groundAt; S.hitAt = hitAt; S.input = input;
})();
