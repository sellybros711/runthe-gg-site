/* 4th and What: the clip, a video of the snap to share.
 *
 * The owner, 2026-11-06: "when u share a play with someone, it should share
 * the video of the play".
 *
 *   FAW_CLIP.start(res, info)  record this snap now, in the background
 *   FAW_CLIP.ready()           the clip { blob, type, ext } once it is made, else null
 *   FAW_CLIP.whenReady()       a promise of it (null when this browser cannot record)
 *   FAW_CLIP.cancel()          stop and throw away a clip being made
 *   FAW_CLIP.supported()       whether this browser can record a canvas
 *
 * The stadium replay (play.js) is played again on a canvas nobody sees, and
 * every frame is copied, big and pixel sharp, onto a frame with the logo, the
 * situation and what just happened; the last beat holds the result. That
 * frame is recorded with MediaRecorder, as MP4 where the browser can (an
 * iPhone needs it to play in Messages) and WebM otherwise. It starts when the
 * result card shows, so the clip is usually ready by the time Share is
 * pressed: a phone only lets a page share in the moment of a tap.
 *
 * Plain script: window.FAW_CLIP.
 */
(function (root) {
  'use strict';
  var W = 540, H = 864, TOP = 92, BOT = 132, HOLD = 1400;
  var TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  var job = null, made = null;

  function typeOf() {
    var MR = root.MediaRecorder;
    if (!MR || !MR.isTypeSupported) return null;
    for (var i = 0; i < TYPES.length; i++) if (MR.isTypeSupported(TYPES[i])) return TYPES[i];
    return null;
  }
  function supported() {
    var c = root.document && root.document.createElement('canvas');
    return !!(c && c.captureStream && typeOf() && root.FAW_LIVE);
  }

  function frame(x, live, info, cap, end) {
    x.fillStyle = '#060f1b'; x.fillRect(0, 0, W, H);
    var h = H - TOP - BOT, w = Math.round(h * live.width / live.height), left = Math.round((W - w) / 2);
    x.imageSmoothingEnabled = false;
    x.drawImage(live, left, TOP, w, h);
    /* the logo and the situation */
    x.textBaseline = 'middle';
    x.font = 'italic 900 44px "Barlow Condensed", Inter, sans-serif'; x.textAlign = 'left';
    x.fillStyle = '#f5b72a'; x.fillText('4TH', 24, 48); var a = x.measureText('4TH').width;
    x.fillStyle = '#19c6a7'; x.fillText('&', 24 + a + 3, 48); var b = x.measureText('&').width;
    x.fillStyle = '#ffffff'; x.fillText('WHAT', 24 + a + b + 6, 48);
    x.textAlign = 'right'; x.fillStyle = '#9fb2c8'; x.font = '800 22px Inter, sans-serif'; x.fillText(info.situation, W - 24, 48);
    /* what just happened, then the result */
    x.textAlign = 'center';
    if (end) {
      x.fillStyle = 'rgba(6, 15, 27, .82)'; x.fillRect(0, H - BOT - 120, W, 120);
      x.fillStyle = end.win ? '#36d399' : '#ef4b3f'; x.font = 'italic 900 64px "Barlow Condensed", Inter, sans-serif';
      x.fillText(end.title, W / 2, H - BOT - 72);
      x.fillStyle = '#ffffff'; x.font = '800 24px Inter, sans-serif'; x.fillText(end.line, W / 2, H - BOT - 26);
    } else if (cap) {
      x.fillStyle = '#ffffff'; x.font = '800 28px Inter, sans-serif'; x.fillText(cap, W / 2, H - BOT - 30);
    }
    x.fillStyle = '#8fa2b8'; x.font = '800 22px Inter, sans-serif'; x.fillText(info.name || '', W / 2, H - 82);
    x.fillStyle = '#f5b72a'; x.font = '800 22px Inter, sans-serif'; x.fillText('runthe.gg/4th-and-what', W / 2, H - 40);
  }

  /* record one snap; info: { situation, name, title, line, win } */
  function start(res, info) {
    cancel();
    made = null;
    var type = supported() ? typeOf() : null;
    if (!type) { job = { promise: Promise.resolve(null) }; return job.promise; }
    var live = root.document.createElement('canvas'), out = root.document.createElement('canvas');
    out.width = W; out.height = H;
    var x = out.getContext('2d'), stream = out.captureStream(30), rec, chunks = [], cap = '', end = null, raf = 0, stopped = false, show = null;
    try { rec = new root.MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2500000 }); }
    catch (e) { job = { promise: Promise.resolve(null) }; return job.promise; }
    var me = {};
    me.promise = new Promise(function (resolve) {
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = function () {
        root.cancelAnimationFrame(raf);
        if (me.cancelled || !chunks.length) { resolve(null); return; }
        var base = type.split(';')[0];
        made = { blob: new Blob(chunks, { type: base }), type: base, ext: base === 'video/mp4' ? 'mp4' : 'webm' };
        resolve(made);
      };
      function paint() { if (stopped) return; frame(x, live, info, cap, end); raf = root.requestAnimationFrame(paint); }
      live.width = 260; live.height = 400;
      frame(x, live, info, '', null);
      rec.start(250);
      paint();
      show = root.FAW_LIVE.show(live, res, {
        caption: function (t) { cap = t; },
        pressure: function () {},
        done: function () {
          end = { title: info.title, line: info.line, win: info.win };
          setTimeout(function () { stopped = true; frame(x, live, info, cap, end); setTimeout(function () { try { rec.stop(); } catch (e) { resolve(null); } }, 120); }, HOLD);
        }
      });
    });
    me.stop = function () { me.cancelled = true; stopped = true; if (show) show.stop(); try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {} };
    job = me;
    return me.promise;
  }
  function cancel() { if (job && job.stop) job.stop(); job = null; }
  function ready() { return made; }
  function whenReady() { return job ? job.promise : Promise.resolve(null); }

  root.FAW_CLIP = { start: start, ready: ready, whenReady: whenReady, cancel: cancel, supported: supported };
})(typeof window !== 'undefined' ? window : this);
