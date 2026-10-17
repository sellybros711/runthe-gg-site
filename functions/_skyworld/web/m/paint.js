/* Painting. A scene (the map, or one world) is painted once, in slices so no frame stutters, and kept in IndexedDB,
   so the next visit opens at once. One painting at a time, and a world being gone into goes before any warming.
   In memory: the map and the last two worlds' pictures. The others reload from IndexedDB when asked for again. */
(function(){
var S = window.SKY_W, W = S.W, ART = S.ART, ELEV = S.ELEV, se = S.se, ce = S.ce;
var FLAT = 'The island painter changed, so this is a flat map for now.', BROKE = 'The islands could not be painted, so this is a flat map.';

function sceneC(){ return { T:window.RTT_PUTT.THEMES.sky, field:{ h:function(){ return 0; } }, poly:[[0, 0], [1, 0], [1, 1]], allPts:[[0, 0], [1, 1]], mats:{ at:function(){ return 0; } }, bounds:[1e9, 1e9, -1e9, -1e9], seed:7,
  bumpers:[], blocks:[], ramps:[], loops:[], movers:[] }; }
// the picture's projection is affine, so four points of it are the whole of it: kept with the picture
function affine(pr){ var o = pr(0, 0, 0), a = pr(1, 0, 0), b = pr(0, 1, 0), c = pr(0, 0, 1); return [o, [a[0] - o[0], a[1] - o[1]], [b[0] - o[0], b[1] - o[1]], [c[0] - o[0], c[1] - o[1]]]; }
// cv is a canvas (just painted) or an ImageBitmap (from IndexedDB); both draw the same
function fromAffine(cv, A){ return { cv:cv, A:A, pr:function(x, y, z){ return [A[0][0] + A[1][0] * x + A[2][0] * y + A[3][0] * z, A[0][1] + A[1][1] * x + A[2][1] * y + A[3][1] * z]; } }; }

// IndexedDB, opened once. null when it is not there (a private window), and then every picture is painted
var dbP = null;
function db(){ return dbP || (dbP = new Promise(function(ok){ try { var q = indexedDB.open('rtg_skyworld', 1); q.onupgradeneeded = function(){ q.result.createObjectStore('pic'); };
  q.onsuccess = function(){ ok(q.result); }; q.onerror = function(){ ok(null); }; } catch (e) { ok(null); } })); }
function idb(mode, fn){ return db().then(function(d){ return d && new Promise(function(ok){ try { fn(d.transaction('pic', mode).objectStore('pic'), ok); } catch (e) { ok(null); } }); }); }
// what a picture was painted from: a change to any of it paints the scene again
function picKey(sc){ return JSON.stringify([S.RENDER_V, W.art, sc.id, sc.list.map(function(g){ return [g.id, g.status, g.kind, g.col, g.layers, Math.round(g.x), Math.round(g.y)]; }), sc.bridges.length]); }
function loadPic(sc){ var key = picKey(sc); return idb('readonly', function(st, ok){ var g = st.get(sc.id); g.onsuccess = function(){ var v = g.result; if (!v || v.key !== key) return ok(null);
  createImageBitmap(v.blob).then(function(bm){ ok(fromAffine(bm, v.A)); }).catch(function(){ ok(null); }); }; g.onerror = function(){ ok(null); }; }); }
function savePic(sc, r){ var key = picKey(sc); try { r.cv.toBlob(function(b){ if (b) idb('readwrite', function(st, ok){ st.put({ key:key, A:r.A, blob:b }, sc.id); ok(); }); }); } catch (e) {} }

// the queue: one painting at a time. A warm (a world painted before it is asked for) runs only when nothing else
// waits; skipWarms(sc) drops the waiting warms, and stops a running one, so going into sc waits for no other world.
var jobs = [], running = null;
function paint(sc, tick, warm){ return new Promise(function(done){ jobs.push({ sc:sc, tick:tick, warm:!!warm, done:done }); next(); }); }
function next(){ if (running || !jobs.length) return; var job = running = jobs.shift();
  run(job, function(o){ running = null; job.done(o); next(); }); }
// resolves { r, warn } (a flat map when the painter is missing or fails), or null for a warm that was skipped
function run(job, done){ var sc = job.sc, H3 = window.RTT_PUTT_3D, step, t0 = performance.now();
  if (!H3 || H3.API_VERSION !== 1 || !window.RTT_PUTT || !window.PXHD) return done({ r:flat(sc), warn:FLAT });
  try { step = H3.slices(sceneC(), { elev:ELEV, art:ART, tcell:ART, fx:true, scene:{ b:sc.B, land:S.makeLand(sc.list, sc.bridges, sc.B), zMax:sc.list[0].world ? 22 : 12, clearAt:function(){ return 20; } } }); }
  catch (e) { return done({ r:flat(sc), warn:BROKE }); }
  (function pump(){ var r, out;
    if (job.skip) return done(null);
    try { r = step(12); if (r) out = fromAffine(r.cv, affine(r.pr)); } catch (e) { return done({ r:flat(sc), warn:BROKE }); }
    if (!r){ if (job.tick) job.tick(); requestAnimationFrame(pump); return; }
    window.SKY_RENDER_MS = Math.round(performance.now() - t0); savePic(sc, out); done({ r:out }); })(); }
function skipWarms(keep){
  jobs = jobs.filter(function(j){ if (j.sc === keep){ j.warm = false; return true; } if (j.warm){ j.done(null); return false; } return true; });
  jobs.sort(function(a, b){ return (b.sc === keep) - (a.sc === keep); });
  if (running && running.sc === keep) running.warm = false; else if (running && running.warm) running.skip = true; }
function warming(){ return !!(running && running.warm) || jobs.some(function(j){ return j.warm; }); }

// the fallback: the same layout, flat, with no borrowed code at all. It is also what the first visit shows while it paints.
function flat(sc){ var k = 1 / ART, B4 = sc.B, w = Math.ceil((B4[2] - B4[0]) * k), h = Math.ceil((B4[3] - B4[1]) * se * k + 40), c = document.createElement('canvas'); c.width = w; c.height = h;
  var x = c.getContext('2d'), A = [[-B4[0] * k, -B4[1] * se * k + 20], [k, 0], [0, se * k], [0, -ce * k]], gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f4f8fc'); gr.addColorStop(1, '#dde9f5'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
  var P = function(px, py, pz){ return [A[0][0] + px * k, A[0][1] + py * se * k - pz * ce * k]; };
  sc.bridges.forEach(function(b){ var p = P(b.ax, b.ay, 0), q = P(b.bx, b.by, 0); x.strokeStyle = b.kind === 'stone' ? '#cfc6b0' : '#a8763f'; x.lineWidth = 8; x.setLineDash(b.kind === 'stone' ? [] : [10, 8]); x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke(); });
  x.setLineDash([]);
  sc.list.forEach(function(g){ var p = P(g.x, g.y, g.z); x.fillStyle = '#9a8468'; x.beginPath(); x.ellipse(p[0], p[1] + 16, g.r * k, g.r * 0.86 * se * k, 0, 0, 7); x.fill();
    x.fillStyle = g.built < 1 ? '#a8b86a' : '#66b952'; x.beginPath(); x.ellipse(p[0], p[1], g.r * k, g.r * 0.86 * se * k, 0, 0, 7); x.fill(); x.fillStyle = g.col; x.beginPath(); x.ellipse(p[0], p[1], g.r * 0.4 * k, g.r * 0.3 * se * k, 0, 0, 7); x.fill(); });
  return fromAffine(c, A); }

// a point of one picture of the map, on another picture of it (the flat stand in, then the painted map)
function carry(from, to, px, py){ var A = from.A, det = A[1][0] * A[2][1] - A[2][0] * A[1][1], ax = px - A[0][0] - A[3][0], ay = py - A[0][1] - A[3][1];
  return to.pr((ax * A[2][1] - A[2][0] * ay) / det, (A[1][0] * ay - ax * A[1][1]) / det, 1); }

// the worlds whose pictures stay in memory, newest first. The map always stays, and so does the one on screen.
var kept = [];
function keep(sc){ if (!sc.world) return; kept = [sc].concat(kept.filter(function(x){ return x !== sc; }));
  for (var i = kept.length - 1; i >= 0 && kept.length > 2; i--){ var o = kept[i]; if (o === S.cur) continue; kept.splice(i, 1);
    var r = o.R; o.R = null; o.P = null; if (r && r.cv && r.cv.close) r.cv.close(); } }
// a scene's picture: one promise per scene, so a warm and a click never paint it twice. Never rejects: anything that
// goes wrong is a flat map. Resolves null only for a warm that was skipped, and then it can be asked for again.
function picture(sc, warm){ if (sc.P) return sc.P;
  var p = sc.P = loadPic(sc).then(function(r){ return r || paint(sc, null, warm).then(function(o){ if (!o) return null; sc.warn = o.warn || null; return o.r; }); })
    .catch(function(){ sc.warn = BROKE; return flat(sc); })
    .then(function(r){ if (!r){ if (sc.P === p) sc.P = null; return null; } sc.R = r; keep(sc); return r; });
  return p; }

S.loadPic = loadPic; S.paint = paint; S.flat = flat; S.carry = carry; S.picture = picture; S.keep = keep; S.skipWarms = skipWarms; S.warming = warming;
})();
