/* The camera. Everything glides: a target and an exponential approach, timed by the frame, not counted by it.
   Zoom moves smoothly through any scale while it is being asked for, then settles on a whole number of screen pixels
   per art pixel, so the pixel art is crisp whenever the camera is still. It never shows past the edge of the clouds.
   Positions are in the picture's pixels; k is screen pixels (device pixels) per picture pixel. */
(function(){
var S = window.SKY_W;
// held: the keys held down (by e.code); dragging and pinching: a finger or the mouse has it; yTop: the picture's top edge of land
var cam = S.cam = { x:0, y:0, k:2, kt:2, ax:null, ay:null, tx:null, ty:null, vx:0, vy:0, lastZoom:0, held:{}, dragging:false, pinching:false, yTop:0 };
var DPR = S.DPR = Math.min(2, window.devicePixelRatio || 1);
S.VW = 0; S.VH = 0;
function fit(){ S.VW = innerWidth; S.VH = innerHeight; [S.cvs, S.ov].forEach(function(c){ c.width = Math.round(S.VW * DPR); c.height = Math.round(S.VH * DPR); c.style.width = S.VW + 'px'; c.style.height = S.VH + 'px'; });
  S.repaint(); }
function kMin(){ return Math.max(DPR, S.cvs.width / S.R.cv.width, S.cvs.height / (S.R.cv.height - cam.yTop)); }
function kMax(){ return 8 * DPR; }
function clampK(k){ return Math.max(kMin(), Math.min(kMax(), k)); }
function clampCam(){ var cv = S.R.cv, hw = S.cvs.width / 2 / cam.k, hh = S.cvs.height / 2 / cam.k;
  cam.x = hw * 2 >= cv.width ? cv.width / 2 : Math.max(hw, Math.min(cv.width - hw, cam.x));
  cam.y = hh * 2 >= cv.height - cam.yTop ? (cv.height + cam.yTop) / 2 : Math.max(cam.yTop + hh, Math.min(cv.height - hh, cam.y)); }
function toScreen(px, py){ return [(px - cam.x) * cam.k + S.cvs.width / 2, (py - cam.y) * cam.k + S.cvs.height / 2]; }
function toPic(sx, sy){ return [(sx * DPR - S.cvs.width / 2) / cam.k + cam.x, (sy * DPR - S.cvs.height / 2) / cam.k + cam.y]; }
// zoom toward a scale, keeping the point under (fx, fy) (CSS pixels; null is the middle of the screen) where it is.
// Glides there, or with instant goes there now: a pinch follows the fingers exactly.
function zoomAt(k, fx, fy, instant){ k = clampK(k); cam.ax = fx == null ? S.VW / 2 : fx; cam.ay = fy == null ? S.VH / 2 : fy; cam.lastZoom = performance.now();
  if (instant){ var p = toPic(cam.ax, cam.ay); cam.k = cam.kt = k; var q = toPic(cam.ax, cam.ay); cam.x += p[0] - q[0]; cam.y += p[1] - q[1]; S.repaint(); }
  else cam.kt = k;
  S.wake(); }
function zoomTo(kt, fx, fy){ zoomAt(kt, fx, fy, false); }
function zoom(d, fx, fy){ zoomTo(cam.kt * (d > 0 ? 1.45 : 1 / 1.45), fx, fy); }
// the whole number of pixels a zoom settles on
function settled(kt){ return Math.max(Math.ceil(kMin() - 1e-6), Math.min(kMax(), Math.round(kt))); }
// one frame of the camera. True while it is still moving (or about to settle), so the loop keeps running.
function step(dt){ var moved = false, e, h = cam.held;
  if (cam.tx != null){ e = 1 - Math.exp(-dt * 9); cam.x += (cam.tx - cam.x) * e; cam.y += (cam.ty - cam.y) * e; if (Math.abs(cam.tx - cam.x) + Math.abs(cam.ty - cam.y) < 0.3) cam.tx = cam.ty = null; moved = true; }
  var kx = (h.ArrowRight || h.KeyD ? 1 : 0) - (h.ArrowLeft || h.KeyA ? 1 : 0), ky = (h.ArrowDown || h.KeyS ? 1 : 0) - (h.ArrowUp || h.KeyW ? 1 : 0);
  if (kx || ky){ var sp = 700 * DPR / cam.k; cam.vx = kx * sp; cam.vy = ky * sp; cam.tx = cam.ty = null; }
  if (!cam.dragging && (Math.abs(cam.vx) + Math.abs(cam.vy)) * cam.k > 4){ cam.x += cam.vx * dt; cam.y += cam.vy * dt; if (!kx && !ky){ e = Math.exp(-dt * 4.5); cam.vx *= e; cam.vy *= e; } moved = true; }
  else if (!kx && !ky){ cam.vx = cam.vy = 0; }
  // settle on a whole number of screen pixels per art pixel once nobody is zooming
  var settling = !cam.pinching && settled(cam.kt) !== cam.kt;
  if (settling && performance.now() - cam.lastZoom > 160){ cam.kt = settled(cam.kt); settling = false; }
  if (cam.kt !== cam.k){ var p = toPic(cam.ax, cam.ay); e = 1 - Math.exp(-dt * 16); cam.k += (cam.kt - cam.k) * e; if (Math.abs(cam.kt - cam.k) < 0.004) cam.k = cam.kt;
    var q = toPic(cam.ax, cam.ay); cam.x += p[0] - q[0]; cam.y += p[1] - q[1]; moved = true; }
  if (moved) S.repaint();
  var ox = cam.x, oy = cam.y; clampCam(); if (ox !== cam.x) cam.vx = 0; if (oy !== cam.y) cam.vy = 0;
  return moved || settling || !!(kx || ky); }
// with a panel open the place goes to the part of the screen still showing: above the sheet on a phone, left of the panel on a desktop
function focus(x, y, z, open){ var q = S.R.pr(x, y, z || 1), phone = innerWidth <= 700; cam.tx = q[0]; cam.ty = q[1]; cam.vx = cam.vy = 0;
  if (open !== false){ if (phone) cam.ty += innerHeight * 0.28 * DPR / cam.kt; else cam.tx += 200 * DPR / cam.kt; }
  S.wake(); }

S.fit = fit; S.kMin = kMin; S.kMax = kMax; S.clampCam = clampCam; S.toScreen = toScreen; S.toPic = toPic;
S.zoomAt = zoomAt; S.zoomTo = zoomTo; S.zoom = zoom; S.step = step; S.focus = focus;
})();
