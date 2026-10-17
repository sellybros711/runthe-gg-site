/* The Sky World on screen: drawing a frame, the frame loop, going into a world and back out, and the start. The
   layout is layout.js, the land land.js and props.js, the pictures paint.js, the camera camera.js, the input input.js.

   Two canvases: #world holds the picture (redrawn only when the camera moves or the picture changes), #over the
   signs, the rings and the characters (redrawn only when one of those, the camera, the pointer or a resize
   changes, or a frame hook says it is animating). When nothing changes the loop stops; any input wakes it. */
(function(){
var S = window.SKY_W, cam = S.cam, DPR = S.DPR, se = S.se, ART = S.ART, MAP = S.MAP;
var cvs, ov, ctx, octx;
S.R = null; S.cur = MAP; S.hov = null; S.sel = null; S.enteredAt = -1e9;

// ---- the frame loop. dirty: the picture must be drawn again; overDirty: the overlay must
var dirty = true, overDirty = true, running = false, last = 0, hookAnim = false, seen = {};
// start the loop if it sleeps (there is nothing to draw before the first picture)
function wake(){ if (running || !S.R) return; running = true; last = 0; requestAnimationFrame(loop); }
function repaint(){ dirty = overDirty = true; wake(); }
function loop(t){ var dt = Math.min(0.05, (t - (last || t)) / 1000); last = t; var busy = S.step(dt); draw(t);
  if (busy || hookAnim || dirty || overDirty) requestAnimationFrame(loop); else running = false; }

// ---- drawing
function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
var widths = {};   // a sign's text width, by its text: measureText on every sign every frame adds up
var FS = Math.round(11.5 * DPR), SH = Math.round(22 * DPR), FONT = '700 ' + FS + 'px system-ui, sans-serif';
function sign(text, x, y, z, on, dot, o){ var q = S.R.pr(x, y, z), s = S.toScreen(q[0], q[1]), tw = widths[text] != null ? widths[text] : (widths[text] = octx.measureText(text).width), w = tw + (dot ? 28 : 18) * DPR;
  octx.fillStyle = on ? '#2f6fd0' : 'rgba(29,53,80,0.88)'; rr(octx, s[0] - w / 2, s[1], w, SH, SH / 2); octx.fill();
  if (dot){ octx.fillStyle = dot; octx.beginPath(); octx.arc(s[0] - w / 2 + 11 * DPR, s[1] + SH / 2, 4 * DPR, 0, 7); octx.fill(); }
  octx.fillStyle = '#ffffff'; octx.fillText(text, s[0] + (dot ? 6 * DPR : 0), s[1] + SH / 2 + FS * 0.36); o.sx = s[0] / DPR; o.sy = s[1] / DPR; o.sw = w / DPR; }
// a district's ground height, worked out once
function distZ(w, d){ return d.z != null ? d.z : (d.z = S.topAt(w, d.x, d.y)); }
function draw(now){ var R = S.R, cur = S.cur, hov = S.hov, sel = S.sel;
  if (dirty){ ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cvs.width, cvs.height);
    // only the part of the picture on screen, so a pan costs the screen's pixels and not the world's
    var o = S.toScreen(0, 0), sx = Math.max(0, Math.floor(-o[0] / cam.k)), sy = Math.max(0, Math.floor(-o[1] / cam.k)),
      sw = Math.min(R.cv.width - sx, Math.ceil(cvs.width / cam.k) + 2), sh = Math.min(R.cv.height - sy, Math.ceil(cvs.height / cam.k) + 2);
    if (sw > 0 && sh > 0) ctx.drawImage(R.cv, sx, sy, sw, sh, Math.round(o[0] + sx * cam.k), Math.round(o[1] + sy * cam.k), sw * cam.k, sh * cam.k);
    dirty = false; }
  // the overlay, when anything on it could have changed
  if (!(overDirty || hookAnim || seen.x !== cam.x || seen.y !== cam.y || seen.k !== cam.k || seen.hov !== hov || seen.sel !== sel || seen.R !== R)) return;
  overDirty = false; seen = { x:cam.x, y:cam.y, k:cam.k, hov:hov, sel:sel, R:R };
  octx.clearRect(0, 0, ov.width, ov.height);
  hookAnim = !!(window.SKY_DRAW && window.SKY_DRAW(octx, now, cur));   // the characters, from stage c: true while they move
  octx.font = FONT; octx.textAlign = 'center';
  if (!cur.world){
    cur.list.forEach(function(g){ var on = (hov && hov.g === g && !hov.p) || (sel && sel.g === g && !sel.p); sign(g.name, g.x, g.y + g.r * 0.95, g.z - 0.8, on, S.status(g).dot, g); });
  } else { var w = cur.w, LN = SKY_UI.layerNames();
    // the district under the pointer or chosen, ringed; and a sign at every district
    [hov, sel].forEach(function(h, n){ if (!h || !h.d || h.p) return; var q = R.pr(h.d.x, h.d.y, distZ(w, h.d)), s = S.toScreen(q[0], q[1]), u = cam.k, rx = 2.6 * w.bs / ART * u;
      octx.strokeStyle = n ? '#ffd23f' : 'rgba(255,255,255,.9)'; octx.lineWidth = Math.max(2, u * 0.5); octx.beginPath(); octx.ellipse(s[0], s[1], rx, rx * 0.66 * se, 0, 0, 7); octx.stroke(); });
    w.dist.forEach(function(d){ var on = (hov && hov.d === d) || (sel && sel.d === d); sign(LN[d.id] || d.id, d.x, d.y + 1.9 * w.bs, distZ(w, d), on, null, d); });
  }
  octx.textAlign = 'left';
}

// ---- warming: a world's picture painted before it is asked for, once the pointer has rested on its island a moment
// (on a desktop only), and one at a time
var rest = null, restG = null;
function restOn(g){ if (g === restG) return; restG = g; clearTimeout(rest); if (g) rest = setTimeout(function(){ warm(g); }, 400); }
function warm(g){ var sc = S.sceneFor(g); if (innerWidth > 700 && !sc.P && !moving && !S.warming()) S.picture(sc, true); }

// ---- going into a world and back out, through the clouds
var moving = false, saved = null;
function show(sc, at){ S.cur = sc; var R = S.R = sc.R; cam.yTop = Math.max(0, Math.ceil(R.pr(0, sc.B[1], 0)[1]) + 2); S.hov = S.sel = null; SKY_UI.hover(null); SKY_UI.select(null);
  cam.vx = cam.vy = 0; cam.tx = cam.ty = null; if (at){ cam.x = at.x; cam.y = at.y; cam.k = cam.kt = at.k; } S.keep(sc); repaint(); if (window.SKY) window.SKY.R = R; }
// on the map a click goes into that world; in a world it opens the panel for what was clicked
function select(h){ if (!S.cur.world && h && h.g && !h.p){ enter(h.g); return; } S.sel = h; SKY_UI.select(h, S.cur); wake(); }
function enter(g){ if (moving) return; moving = true; S.enteredAt = performance.now(); restOn(null); var sc = S.sceneFor(g), slow = null;
  S.skipWarms(sc);
  saved = { x:cam.x, y:cam.y, k:cam.kt };
  var q = S.R.pr(g.x, g.y, g.z); cam.tx = q[0]; cam.ty = q[1]; S.zoomTo(cam.kt * 1.8);
  slow = setTimeout(function(){ SKY_UI.flying(g); }, 500);
  Promise.all([S.picture(sc), SKY_UI.fade(true)]).then(function(r){ return r[0] || S.picture(sc); }).then(function(){
    show(sc); var c = S.R.pr(0, 1, sc.w.z), fitW = cvs.width / (2.25 * sc.w.r / ART), fitH = (cvs.height - 70 * DPR) / (2.1 * sc.w.r * 0.86 * se / ART + 8 / ART);
    cam.k = cam.kt = Math.max(Math.ceil(S.kMin()), Math.min(4 * DPR, Math.floor(Math.min(fitW, fitH))));   // the whole island in view, as large as fits
    cam.x = c[0]; cam.y = c[1]; S.clampCam();
    SKY_UI.entered(g, sc.w); SKY_UI.warn(sc.warn); })
    .catch(function(){ /* it stays on the map */ })
    .finally(function(){ clearTimeout(slow); return SKY_UI.fade(false).then(function(){ moving = false; }); }); }
function leave(){ if (moving || !S.cur.world) return; moving = true;
  SKY_UI.fade(true).then(function(){ show(MAP, saved); SKY_UI.left(); SKY_UI.warn(MAP.warn); S.zoomTo(cam.kt / 1.4); })
    .catch(function(){})
    .finally(function(){ return SKY_UI.fade(false).then(function(){ moving = false; }); }); }

S.wake = wake; S.repaint = repaint; S.select = select; S.enter = enter; S.leave = leave; S.restOn = restOn;
S.moving = function(){ return moving; };

// ---- start: the map, at once; on a first visit a flat map stands in while the islands are painted
SKY_UI.mount(S.W, S.games, { leave:function(){ leave(); } });
cvs = S.cvs = SKY_UI.el('world'); ov = S.ov = SKY_UI.el('over'); ctx = cvs.getContext('2d'); octx = ov.getContext('2d');
S.fit();
S.loadPic(MAP).then(function(cached){
  function go(r, warn, early){ MAP.R = r; MAP.P = Promise.resolve(r); show(MAP); cam.k = cam.kt = Math.max(Math.ceil(S.kMin()), 2 * DPR); var hub = S.hub, c = S.R.pr(hub.x, hub.y + 4, hub.z); cam.x = c[0]; cam.y = c[1]; S.clampCam();
    window.SKY = { cam:cam, games:S.games, bridges:S.bridges, hub:hub, se:se, R:S.R, toScreen:S.toScreen, focus:S.focus, select:select, zoom:S.zoom, enter:enter, leave:leave, topAt:S.topAt, shape:S.shape, DPR:DPR,
      scene:function(){ return S.cur; }, dirty:repaint, wake:wake };
    S.input(); if (early) SKY_UI.painting(); else SKY_UI.ready(warn); repaint(); window.dispatchEvent(new Event('sky-ready')); }
  if (cached) return go(cached);
  go(S.flat(MAP), null, true);
  S.paint(MAP, SKY_UI.progress).then(function(o){ var old = MAP.R; MAP.R = o.r; MAP.P = Promise.resolve(o.r); MAP.warn = o.warn || null;
    if (S.cur === MAP){ var q = S.carry(old, o.r, cam.x, cam.y); show(MAP); cam.x = q[0]; cam.y = q[1]; }
    else if (saved){ var q2 = S.carry(old, o.r, saved.x, saved.y); saved.x = q2[0]; saved.y = q2[1]; }
    if (S.cur === MAP) SKY_UI.ready(o.warn); else SKY_UI.ready();   // a world's own note stays while it is open
    window.dispatchEvent(new Event('sky-repaint')); }); });
})();
